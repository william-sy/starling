import { writable, get } from 'svelte/store';
import { account } from './auth';
import { contacts } from './contacts';
import { relaySend } from './relay';

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active';

export interface CallSession {
  state:         CallState;
  peerPin:       string;
  peerName:      string;
  startedAt:     number | null;
  muted:         boolean;
  video:         boolean;
  camOff:        boolean;
  screenSharing: boolean;
  error:         string;
}

const IDLE: CallSession = {
  state: 'idle', peerPin: '', peerName: '', startedAt: null,
  muted: false, video: false, camOff: false, screenSharing: false, error: '',
};

export const call = writable<CallSession>({ ...IDLE });

// Exposed so CallOverlay can attach them to <video> elements
export const localStream  = writable<MediaStream | null>(null);
export const remoteStream = writable<MediaStream | null>(null);

let pc: RTCPeerConnection | null = null;
let _localStream: MediaStream | null = null;
let remoteAudio: HTMLAudioElement | null = null;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

function relayUrl(): string {
  const acc = get(account);
  if (!acc?.relay_url) return '';
  try {
    const u = new URL(acc.relay_url);
    return `${u.protocol}//${u.host}`;
  } catch { return ''; }
}

async function fetchTurnCreds(): Promise<RTCIceServer[]> {
  try {
    const base = relayUrl();
    if (!base) return [];
    const acc = get(account);
    if (!acc) return [];
    const res = await fetch(`${base}/turn-creds`, { headers: { 'X-Pin': acc.pin } });
    if (!res.ok) return [];
    const { username, credential, urls } = await res.json() as { username: string; credential: string; urls: string | string[] };
    return [{ urls, username, credential }];
  } catch { return []; }
}

function peerName(pin: string): string {
  const c = get(contacts).find(c => c.pin === pin);
  return c?.display_name ?? pin.slice(0, 8);
}

async function createPc(withVideo: boolean): Promise<RTCPeerConnection> {
  const turn = await fetchTurnCreds();
  const newPc = new RTCPeerConnection({ iceServers: [...ICE_SERVERS, ...turn] });

  _localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo });
  localStream.set(_localStream);
  _localStream.getTracks().forEach(t => newPc.addTrack(t, _localStream!));

  newPc.ontrack = e => {
    if (e.streams[0]) {
      remoteStream.set(e.streams[0]);
      if (!withVideo) {
        if (!remoteAudio) { remoteAudio = new Audio(); remoteAudio.autoplay = true; }
        remoteAudio.srcObject = e.streams[0];
      }
    }
  };

  newPc.onicecandidate = e => {
    if (!e.candidate) return;
    const acc = get(account);
    const { peerPin } = get(call);
    if (!acc || !peerPin) return;
    relaySend(peerPin, { type: 'call-ice', from: acc.pin, candidate: e.candidate.toJSON(), ts: Date.now() }).catch(() => {});
  };

  newPc.onconnectionstatechange = () => {
    if (newPc.connectionState === 'connected') {
      call.update(s => ({ ...s, state: 'active', startedAt: Date.now() }));
    } else if (['failed', 'disconnected', 'closed'].includes(newPc.connectionState)) {
      cleanupCall();
    }
  };

  return newPc;
}

export async function initiateCall(peerPin: string, withVideo = false) {
  if (get(call).state !== 'idle') return;
  const acc = get(account);
  if (!acc) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    call.update(s => ({ ...s, error: 'Microphone access requires HTTPS' }));
    setTimeout(() => call.update(s => ({ ...s, error: '' })), 4000);
    return;
  }

  call.set({ state: 'outgoing', peerPin, peerName: peerName(peerPin), startedAt: null, muted: false, video: withVideo, camOff: false, screenSharing: false, error: '' });

  try {
    pc = await createPc(withVideo);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await relaySend(peerPin, { type: 'call-offer', from: acc.pin, sdp: offer.sdp, video: withVideo, ts: Date.now() });
  } catch (err) {
    const msg = err instanceof DOMException && err.name === 'NotAllowedError'
      ? 'Microphone access denied'
      : 'Could not start call';
    call.set({ ...IDLE, error: msg });
    setTimeout(() => call.update(s => ({ ...s, error: '' })), 4000);
  }
}

export async function answerCall() {
  const { peerPin, state, video } = get(call);
  if (state !== 'incoming') return;
  const acc = get(account);
  if (!acc) return;

  call.update(s => ({ ...s, state: 'connecting' }));

  const pending = _pendingSdp;
  _pendingSdp = null;

  try {
    pc = await createPc(video);
    await pc.setRemoteDescription({ type: 'offer', sdp: pending ?? '' });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await relaySend(peerPin, { type: 'call-answer', from: acc.pin, sdp: answer.sdp, ts: Date.now() });
  } catch {
    cleanupCall();
  }
}

export function hangUp() {
  const { peerPin } = get(call);
  const acc = get(account);
  if (acc && peerPin) {
    relaySend(peerPin, { type: 'call-end', from: acc.pin, ts: Date.now() }).catch(() => {});
  }
  cleanupCall();
}

export function toggleMute() {
  if (!_localStream) return;
  const nowMuted = !get(call).muted;
  _localStream.getAudioTracks().forEach(t => { t.enabled = !nowMuted; });
  call.update(s => ({ ...s, muted: nowMuted }));
}

export function toggleCamera() {
  if (!_localStream) return;
  const nowOff = !get(call).camOff;
  _localStream.getVideoTracks().forEach(t => { t.enabled = !nowOff; });
  call.update(s => ({ ...s, camOff: nowOff }));
}

export async function toggleScreenShare(): Promise<void> {
  if (!pc || !_localStream) return;
  const nowSharing = !get(call).screenSharing;

  if (nowSharing) {
    let screenStream: MediaStream;
    try {
      screenStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
    } catch {
      return;
    }
    const screenTrack = screenStream.getVideoTracks()[0];
    if (!screenTrack) return;

    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(screenTrack);

    const newStream = new MediaStream([..._localStream.getAudioTracks(), screenTrack]);
    _localStream = newStream;
    localStream.set(newStream);
    call.update(s => ({ ...s, screenSharing: true, camOff: false }));

    screenTrack.onended = () => { toggleScreenShare().catch(() => {}); };
  } else {
    let camStream: MediaStream;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch {
      call.update(s => ({ ...s, screenSharing: false }));
      return;
    }
    const camTrack = camStream.getVideoTracks()[0];
    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender && camTrack) await sender.replaceTrack(camTrack);

    const newStream = new MediaStream([..._localStream.getAudioTracks(), camTrack]);
    _localStream = newStream;
    localStream.set(newStream);
    call.update(s => ({ ...s, screenSharing: false }));
  }
}

let _pendingSdp: string | null = null;
let _pendingVideo = false;

export async function handleCallSignal(payload: Record<string, unknown>) {
  const type = payload.type as string;
  const from = payload.from as string;
  const sdp  = payload.sdp  as string | undefined;
  const cand = payload.candidate as RTCIceCandidateInit | undefined;

  if (type === 'call-offer') {
    if (get(call).state !== 'idle') {
      const acc = get(account);
      if (acc) relaySend(from, { type: 'call-end', from: acc.pin, ts: Date.now() }).catch(() => {});
      return;
    }
    _pendingSdp   = sdp ?? null;
    _pendingVideo = !!(payload.video);
    call.set({ state: 'incoming', peerPin: from, peerName: peerName(from), startedAt: null, muted: false, video: _pendingVideo, camOff: false, screenSharing: false, error: '' });
    return;
  }

  if (type === 'call-answer' && pc) {
    await pc.setRemoteDescription({ type: 'answer', sdp: sdp ?? '' }).catch(() => {});
    return;
  }

  if (type === 'call-ice' && pc && cand) {
    await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
    return;
  }

  if (type === 'call-end') {
    cleanupCall();
    return;
  }
}

function cleanupCall() {
  if (_localStream) { _localStream.getTracks().forEach(t => t.stop()); _localStream = null; }
  localStream.set(null);
  remoteStream.set(null);
  if (remoteAudio) { remoteAudio.srcObject = null; remoteAudio = null; }
  if (pc) { pc.close(); pc = null; }
  _pendingSdp   = null;
  _pendingVideo = false;
  call.set({ ...IDLE });
}

<script>
  import BirdIcon from '$lib/components/ui/BirdIcon.svelte';
</script>

<div class="splash">
  <div class="logo">
    <BirdIcon size={56} color="white" />
    <span class="name">Starling</span>
  </div>
</div>

<style>
.splash {
  height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: var(--panel-header);
}
.logo {
  display: flex; flex-direction: column; align-items: center; gap: .75rem;
  animation: fade-in .4s ease;
}
.name {
  font-size: 20px; font-weight: 700;
  color: rgba(255,255,255,.9);
  letter-spacing: 0.12em;
}
@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>

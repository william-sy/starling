<script lang="ts">
  export let size: number = 48;
  export let color: string = 'currentColor';
</script>

<!-- Stylised carrier pigeon, side profile. Scales cleanly from 20px to 200px. -->
<svg
  width={size}
  height={size}
  viewBox="0 0 64 64"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <!-- Body -->
  <ellipse cx="28" cy="40" rx="21" ry="16" fill={color}/>
  <!-- Head -->
  <circle cx="44" cy="22" r="13" fill={color}/>
  <!-- Beak -->
  <path d="M55 19 L63 22 L55 26 Z" fill={color}/>
  <!-- Tail fan -->
  <path d="M7 40 L0 28 L9 34 L3 44 L11 38 Z" fill={color}/>
  <!-- Wing shimmer -->
  <ellipse cx="24" cy="37" rx="13" ry="9" fill="white" fill-opacity="0.18"/>
  <!-- Eye ring -->
  <circle cx="47" cy="18" r="4.5" fill="white"/>
  <!-- Eye pupil -->
  <circle cx="48" cy="18" r="2.5" fill={color} opacity="0.65"/>
</svg>

<style>
svg { display: block; flex-shrink: 0; }
</style>

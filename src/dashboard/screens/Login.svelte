 <script>
  import Logo from '../components/Logo.svelte'
  
  
</script>
<!-- Background -->
<div class="fixed inset-0 z-0 bg-white dark:bg-slate-950">
  <div
  class="pointer-events-none absolute inset-x-0 top-[-20%] mx-auto h-200 w-[90%] rounded-3xl blur-3xl dark:opacity-10"
  style="background: radial-gradient(60% 60% at 50% 40%, #ffa3d84a 0%, #aac6ff40 45%, #d5a8ff2e 65%, transparent 80%);"
  ></div>
</div>

<section class="relative z-10 w-full m-auto max-w-md px-4">
  <!-- Header -->
  <header class="flex items-center justify-center pb-6">
    <a href="/" aria-label="Home" class="origin-top scale-80 inline-flex items-center bg-strong-rainbow" style="clip-path: url(#logo-clip);">
      <Logo />
    </a>
  </header>
  
  <!-- Card -->
  <div class="relative -mt-8 rounded-3xl overflow-hidden bg-white dark:bg-slate-900/50 p-6 shadow-blue-gray">
    <!-- holo top border -->
    <div class="pointer-events-none absolute inset-x-0 top-0 h-0.75 bg-strong-rainbow"></div>
    
    <h1 class="text-center text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100 md:text-2xl">
      Website Panel
    </h1>
    
    <form class="mt-8 space-y-5">
      <!-- Email -->
      <label class="block">
        <span class="pb-1.5 block font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Email
        </span>
        <input
        type="email"
        placeholder="you@example.com"
        required
        class="text-field"
        />
      </label>
      
      <!-- Password -->
      <label class="block pb-2">
        <span class="pb-1.5 block font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Password
        </span>
        <input
        type="password"
        placeholder="••••••••"
        required
        class="text-field"
        />
      </label>
      
      <!-- Submit -->
      <button
        type="submit"
        class="btn w-full"
        >
        <span class="relative z-10">Log In</span>
      </button>
    </form>
  </div>
</section>

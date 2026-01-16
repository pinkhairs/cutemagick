<script>
  import { route } from "@mateothegreat/svelte5-router";
  import Logo from '../assets/Logo.svg'


</script>
<!-- Background -->
<div class="fixed inset-0 z-0 bg-white dark:bg-slate-950">
  <div
    class="pointer-events-none absolute inset-x-0 top-[-20%] mx-auto h-200 w-[90%] rounded-3xl blur-3xl dark:opacity-10"
    style="background: radial-gradient(60% 60% at 50% 40%, #ffa3d84a 0%, #aac6ff40 45%, #d5a8ff2e 65%, transparent 80%);"
  ></div>
</div>

<section class="relative z-10 mx-auto max-w-md px-4 pb-24">
  <!-- Header -->
  <header class="flex items-center justify-center py-6">
    <a href="/" aria-label="Home" class="inline-flex items-center">
      <img
        src={Logo}
        alt="Cute Magick"
        class="h-24 w-auto"
      />
    </a>
  </header>

  <!-- Card -->
  <div class="relative rounded-3xl overflow-hidden bg-white dark:bg-slate-900/50 p-6 shadow-blue-gray">
    <!-- holo top border -->
    <div class="pointer-events-none absolute inset-x-0 top-0 h-0.75 bg-dark-rainbow"></div>

    <h1 class="text-center text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100 md:text-2xl">
      Website Panel
    </h1>

    <form class="mt-8 space-y-5">
      <!-- Email -->
      <label class="block">
        <span class="mb-1.5 block font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
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
        <span class="mb-1.5 block font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
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

      <!-- Forgot password -->
      <div class="text-center">
        <a
        use:route
          href="/forgot-password"
          class="dark:text-white"
        >
          Forgot your password?
        </a>
      </div>
    </form>
  </div>
</section>

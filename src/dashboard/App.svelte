<script>
  import { Router } from "@mateothegreat/svelte5-router";
  import Login from './screens/Login.svelte';

  const routes = [
    {
      component: Login
    }
  ];
</script>

<Router {routes} />
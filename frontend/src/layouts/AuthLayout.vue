<template>
  <v-app class="login-app">
    <v-main class="d-flex align-center justify-center" style="min-height: 100vh;">
      <div class="login-bg-grid" />
      <v-container style="max-width: 420px; position: relative; z-index: 1;">
        <slot />
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.login-app {
  background: var(--bg-base) !important;
  position: relative;
  overflow: hidden;
}

/* Subtle grid background */
.login-bg-grid {
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(59, 130, 246, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(59, 130, 246, 0.04) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
  z-index: 0;
}

/* Glow blob top left */
.login-app::before {
  content: '';
  position: fixed;
  top: -200px;
  left: -200px;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

/* Glow blob bottom right */
.login-app::after {
  content: '';
  position: fixed;
  bottom: -200px;
  right: -200px;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}
</style>

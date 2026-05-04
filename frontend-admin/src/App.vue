<template>
  <v-app class="app-container">
    <router-view />
  </v-app>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

html, body {
  font-family: 'Plus Jakarta Sans', sans-serif !important;
}

.app-container {
  position: relative;
  min-height: 100vh;
}

/* Ensure Vuetify typography inherits the modern font */
.v-application {
  font-family: 'Plus Jakarta Sans', sans-serif !important;
  z-index: 1;
}

/* Scrollbar customization */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.02); 
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15); 
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3); 
}
</style>

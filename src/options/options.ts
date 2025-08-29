import App from './App.svelte';

function mount() {
  const target = document.getElementById('app');
  if (!target) {
    console.error('Svelte mount target #app not found');
    return;
  }
  new App({ target });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}

export {};

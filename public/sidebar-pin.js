(() => {
  const sidebar = document.getElementById('schoolSidebar');
  const button = sidebar?.querySelector('.sidebar-menu');
  if (!sidebar || !button) return;
  let pinned = false;
  button.addEventListener('click', () => {
    pinned = !pinned;
    sidebar.classList.toggle('is-pinned', pinned);
    button.setAttribute('aria-pressed', String(pinned));
    button.title = pinned ? 'Открепить меню' : 'Закрепить меню';
    button.setAttribute('aria-label', button.title);
    if (!pinned) button.blur();
  });
})();

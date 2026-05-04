function openTosViewer() {
  document.getElementById('tos-viewer-overlay').classList.add('open');
}
function closeTosViewer() {
  document.getElementById('tos-viewer-overlay').classList.remove('open');
}
document.getElementById('tos-viewer-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeTosViewer();
});

function toggleMobSidebar() {
  document.getElementById('sidebar').classList.toggle('mob-open');
  document.getElementById('sidebar-backdrop').classList.toggle('mob-open');
}
function closeMobSidebar() {
  document.getElementById('sidebar').classList.remove('mob-open');
  document.getElementById('sidebar-backdrop').classList.remove('mob-open');
}
// Close sidebar when a board/nav item is clicked on mobile
document.getElementById('sidebar').addEventListener('click', function(e) {
  if (window.innerWidth <= 768 && (e.target.closest('.board-item') || e.target.closest('.sidebar-item'))) {
    closeMobSidebar();
  }
});

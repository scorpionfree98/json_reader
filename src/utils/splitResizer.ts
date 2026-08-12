let cleanupCurrentResizer: (() => void) | null = null;

const MIN_LEFT_PANEL_WIDTH = 420;
const MIN_RIGHT_PANEL_WIDTH = 320;

export const initSplitResizer = (): void => {
  cleanupCurrentResizer?.();
  cleanupCurrentResizer = null;

  const resizer = document.getElementById('splitResizer');
  const leftPanel = document.getElementById('splitLeftPanel');
  const rightPanel = document.getElementById('splitRightPanel');
  const container = document.getElementById('splitViewContainer');
  if (!resizer || !leftPanel || !rightPanel || !container) return;

  let isResizing = false;
  let startX = 0;
  let startLeftWidth = 0;

  const onMouseDown = (event: MouseEvent) => {
    isResizing = true;
    startX = event.clientX;
    startLeftWidth = leftPanel.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    event.preventDefault();
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!isResizing) return;
    const containerStyle = window.getComputedStyle(container);
    const horizontalPadding = Number.parseFloat(containerStyle.paddingLeft) + Number.parseFloat(containerStyle.paddingRight);
    const availableWidth = container.clientWidth - horizontalPadding - resizer.getBoundingClientRect().width;
    if (availableWidth <= 0) return;

    const desiredLeftWidth = startLeftWidth + event.clientX - startX;
    const maxLeftWidth = Math.max(MIN_LEFT_PANEL_WIDTH, availableWidth - MIN_RIGHT_PANEL_WIDTH);
    const clampedLeftWidth = Math.min(Math.max(desiredLeftWidth, MIN_LEFT_PANEL_WIDTH), maxLeftWidth);
    leftPanel.style.flex = `0 0 ${clampedLeftWidth}px`;
    rightPanel.style.flex = '1 1 auto';
  };

  const onMouseUp = () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  resizer.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  cleanupCurrentResizer = () => {
    resizer.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
};

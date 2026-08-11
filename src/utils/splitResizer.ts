let cleanupCurrentResizer: (() => void) | null = null;

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
    const containerWidth = container.getBoundingClientRect().width;
    if (containerWidth <= 0) return;

    const newLeftWidth = ((startLeftWidth + event.clientX - startX) / containerWidth) * 100;
    if (newLeftWidth < 20 || newLeftWidth > 80) return;
    leftPanel.style.flex = `0 0 ${newLeftWidth}%`;
    rightPanel.style.flex = `0 0 ${100 - newLeftWidth}%`;
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

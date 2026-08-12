export const DEFAULT_MAX_EDITOR_RENDER_NODES = 10_000;

const isContainer = (value: unknown): value is unknown[] | Record<string, unknown> =>
  value !== null && typeof value === 'object';

export const exceedsJsonNodeLimit = (
  value: unknown,
  limit = DEFAULT_MAX_EDITOR_RENDER_NODES
): boolean => {
  let nodeCount = 1;
  const containers = isContainer(value) ? [value] : [];

  while (containers.length > 0) {
    const container = containers.pop()!;
    if (Array.isArray(container)) {
      nodeCount += container.length;
      if (nodeCount > limit) return true;
      for (const child of container) if (isContainer(child)) containers.push(child);
      continue;
    }

    for (const key in container) {
      if (!Object.prototype.hasOwnProperty.call(container, key)) continue;
      nodeCount += 1;
      if (nodeCount > limit) return true;
      const child = container[key];
      if (isContainer(child)) containers.push(child);
    }
  }

  return false;
};

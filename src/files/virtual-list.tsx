import { createSignal, onMount, onCleanup, createMemo, For, JSX } from "solid-js";

export interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => JSX.Element;
  overscan?: number;
  class?: string;
}

export function VirtualList<T>(props: VirtualListProps<T>) {
  let containerRef!: HTMLDivElement;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(400);

  const overscan = () => props.overscan ?? 5;
  const totalHeight = () => props.items.length * props.itemHeight;

  const visibleRange = createMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop() / props.itemHeight) - overscan());
    const visibleCount = Math.ceil(viewportHeight() / props.itemHeight) + overscan() * 2;
    const end = Math.min(props.items.length, start + visibleCount);
    return { start, end };
  });

  const visibleItems = createMemo(() => {
    const { start, end } = visibleRange();
    return props.items.slice(start, end).map((item, i) => ({
      item,
      index: start + i,
      offset: (start + i) * props.itemHeight,
    }));
  });

  const handleScroll = () => {
    if (containerRef) {
      setScrollTop(containerRef.scrollTop);
    }
  };

  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
      }
    });
    observer.observe(containerRef);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      class={`relative overflow-y-auto overflow-x-hidden ${props.class || ""}`}
    >
      <div style={{ height: `${totalHeight()}px`, width: "100%", position: "relative" }}>
        <For each={visibleItems()}>
          {(entry) => (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${props.itemHeight}px`,
                transform: `translateY(${entry.offset}px)`,
              }}
            >
              {props.renderItem(entry.item, entry.index)}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

// app/chat/layout.tsx — 独立layout，隔离Float的全局样式
import type { Viewport } from "next";

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        /* 重置Float全局样式对/chat的影响 */
        body { margin: 0; padding: 0; overflow: hidden; background: #f5f5f5; }
        /* 隐藏Float全局组件 */
        body > .chat-plugin-bootstrap,
        body > .css-import-enhancer,
        body > [data-chat-plugin],
        body > [data-reasoning] { display: none !important; }
        /* 注意：不再清除 .page-title::after，让 CSS 主题的额外装饰（如莓莓兔丸的颜文字）正常显示 */
      `}</style>
      {children}
    </>
  );
}

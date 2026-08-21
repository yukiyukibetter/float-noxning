// app/chat/layout.tsx — 独立layout，隔离Float的全局样式
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
        /* 清除Float的page-title::after装饰 */
        .page-title::after { content: none !important; }
      `}</style>
      {children}
    </>
  );
}

---
"roo-code-continue": patch
---

Fix: webview grey-screen observability & recovery. Webview runtime errors (`window.onerror`, unhandled rejections, ErrorBoundary) are now reported to the extension output channel for grey-screen diagnosis; a ping/pong heartbeat detects unresponsive webviews and offers a "Reload Panel" recovery option.

// Screenshot capture runs in the extension (sidepanel) context via
// chrome.tabs.captureVisibleTab — not inside the page. Kept in the
// content folder per project structure; imported by the sidepanel.

export async function captureScreenshot(maxWidth = 1280): Promise<string | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || tab.status !== 'complete') {
      // Still attempt capture even if status is unknown.
    }
    if (tab?.url && !/^https?:/.test(tab.url)) return null;
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 60 });
    if (!dataUrl) return null;
    // Downscale to bound payload size.
    const downscaled = await downscale(dataUrl, maxWidth);
    return downscaled ?? dataUrl;
  } catch {
    return null;
  }
}

function downscale(dataUrl: string, maxWidth: number): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          if (img.width <= maxWidth) {
            resolve(dataUrl);
            return;
          }
          const scale = maxWidth / img.width;
          const canvas = document.createElement('canvas');
          canvas.width = maxWidth;
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    } catch {
      resolve(null);
    }
  });
}

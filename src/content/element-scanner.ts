// Builds short, stable CSS selectors without leaking page internals.
// Never includes input values — selectors only.

function cssEscapeIdent(value: string): string {
  // Minimal escape for class/id names.
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

export function buildSelector(el: Element): string {
  try {
    const matchesOnlyElement = (selector: string) => {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === el;
    };

    if (el.id) {
      const idSelector = `#${cssEscapeIdent(el.id)}`;
      if (matchesOnlyElement(idSelector)) return idSelector;
    }

    const tag = el.tagName.toLowerCase();
    const classList = Array.from((el as HTMLElement).classList ?? [])
      .filter(Boolean)
      .slice(0, 2)
      .map((className) => `.${cssEscapeIdent(className)}`)
      .join('');
    const simpleSelector = `${tag}${classList}`;
    if (classList && matchesOnlyElement(simpleSelector)) return simpleSelector;

    const parts: string[] = [];
    let current: Element | null = el;
    while (current) {
      const currentElement: Element = current;
      const currentTag = currentElement.tagName.toLowerCase();
      const parentElement: HTMLElement | null = currentElement.parentElement;
      if (currentElement.id) {
        const idSelector = `#${cssEscapeIdent(currentElement.id)}`;
        if (matchesOnlyElement(idSelector)) {
          parts.unshift(idSelector);
          break;
        }
      }
      if (parentElement) {
        const sameTagSiblings = Array.from(parentElement.children).filter(
          (sibling: Element) => sibling.tagName === currentElement.tagName,
        );
        const index = sameTagSiblings.indexOf(currentElement) + 1;
        parts.unshift(`${currentTag}:nth-of-type(${index})`);
      } else {
        parts.unshift(currentTag);
      }
      current = parentElement;
    }

    const path = parts.join(' > ');
    return matchesOnlyElement(path) ? path : simpleSelector;
  } catch {
    return el.tagName.toLowerCase();
  }
}

export function isProbablyVisible(el: Element): boolean {
  try {
    if (
      el.closest('#inspectra-floating-overlay-host') ||
      el.closest('#inspectra-minimized-btn') ||
      el.closest('#inspectra-issue-marker-layer')
    ) {
      return false;
    }
    const htmlEl = el as HTMLElement;
    const style = window.getComputedStyle(htmlEl);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = htmlEl.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return false;
    // Within (or near) the viewport — allow below-the-fold content.
    if (rect.bottom < -200 || rect.top > window.innerHeight * 4 + 2000) return false;
    if (rect.right < 0 || rect.left > window.innerWidth + 400) return false;
    return true;
  } catch {
    return false;
  }
}

export function safeText(el: Element, maxLen: number): string | undefined {
  try {
    const tag = el.tagName.toLowerCase();
    // Privacy: never extract values from sensitive fields.
    if (tag === 'input') {
      const type = (el as HTMLInputElement).type?.toLowerCase() ?? 'text';
      if (['password', 'email', 'tel', 'number', 'hidden'].includes(type)) return undefined;
      const v = (el as HTMLInputElement).placeholder || (el as HTMLInputElement).ariaLabel || '';
      return v ? v.slice(0, maxLen) : undefined;
    }
    if (tag === 'textarea' || tag === 'select') return undefined;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return undefined;
    return text.slice(0, maxLen);
  } catch {
    return undefined;
  }
}

export function semanticRole(el: Element): string | undefined {
  try {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    const map: Record<string, string> = {
      button: 'button',
      a: 'link',
      nav: 'navigation',
      main: 'main',
      header: 'banner',
      footer: 'contentinfo',
      form: 'form',
      input: 'textbox',
      select: 'combobox',
      textarea: 'textbox',
      h1: 'heading',
      h2: 'heading',
      h3: 'heading',
      img: 'img',
      dialog: 'dialog',
      table: 'table',
      ul: 'list',
      ol: 'list',
    };
    return map[tag];
  } catch {
    return undefined;
  }
}

export function isInteractive(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (['button', 'a', 'input', 'select', 'textarea', 'summary'].includes(tag)) return true;
  if (el.hasAttribute('onclick')) return true;
  try {
    const style = window.getComputedStyle(el as HTMLElement);
    if (style.cursor === 'pointer') return true;
  } catch {
    /* ignore */
  }
  const role = el.getAttribute('role');
  return role === 'button' || role === 'link' || role === 'tab';
}

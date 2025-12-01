import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { toast } from 'sonner';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function copyTextToClipboard(text, successMessage = 'Copied to clipboard!', errorMessage = 'Failed to copy.') {
  console.log('DEBUG: copyTextToClipboard called with text:', text);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(successMessage),
      () => toast.error(errorMessage)
    );
  } else {
    // Fallback for insecure contexts (http)
    console.log('DEBUG: Using fallback copy logic.');
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed'; // Prevent scrolling to bottom
    textArea.style.top = 0;
    textArea.style.left = 0;
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = 0;
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      if (successful) {
        toast.success(successMessage);
      } else {
        toast.error(errorMessage);
      }
    } catch (err) {
      toast.error(errorMessage);
    }

    document.body.removeChild(textArea);
  }
}

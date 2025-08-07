// Baut den User-Content für Chat Completions inkl. optionalem Bildlink
export function buildVisionContent(userText, imageUrl) {
    if (!imageUrl) {
      return { role: 'user', content: userText };
    }
    return {
      role: 'user',
      content: [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    };
  }
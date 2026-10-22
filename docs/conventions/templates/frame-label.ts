export interface FrameLabel {
  pageName: string;
  frameName: string;
}

export function formatFrameLabel(label: FrameLabel): string {
  const pageName = label.pageName.trim();
  const frameName = label.frameName.trim();

  if (!pageName || !frameName) {
    throw new Error("A frame label requires a page name and a frame name");
  }

  return `${pageName} / ${frameName}`;
}

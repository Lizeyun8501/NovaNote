export function getDailyNotePath(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}.md`;
}

export function getDailyNoteTemplate(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });
  return `# ${dateStr}\n\n## 今日计划\n\n- \n\n## 笔记\n\n`;
}

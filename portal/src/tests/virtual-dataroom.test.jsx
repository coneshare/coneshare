import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataroomWorkflowShowcase } from '../../components/DataroomWorkflowShowcase';

vi.mock('next/image', () => ({
  default: ({ priority, alt = '', ...props }) => <img alt={alt} {...props} />,
}));

describe('portal/components/DataroomWorkflowShowcase', () => {
  it('renders 4 English VDR workflow tabs and switches exclusive screenshots on click and keyboard', () => {
    render(<DataroomWorkflowShowcase locale="en" />);

    const permTab = screen.getByRole('tab', { name: 'Per-Link Permissions' });
    const qnaTab = screen.getByRole('tab', { name: 'Private Q&A' });
    const brandingTab = screen.getByRole('tab', { name: 'Portal & Indexing' });
    const sessionsTab = screen.getByRole('tab', { name: 'Visitor Sessions' });

    expect(permTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('img')).toHaveAttribute('src', '/screenshots/feat-vdr-manage-perm.png');
    expect(screen.queryByText(/Click image to enlarge/i)).not.toBeInTheDocument();

    fireEvent.click(qnaTab);
    expect(qnaTab).toHaveAttribute('aria-selected', 'true');
    expect(permTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('img')).toHaveAttribute('src', '/screenshots/feat-vdr-qna.png');

    fireEvent.keyDown(qnaTab, { key: 'ArrowRight' });
    expect(brandingTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('img')).toHaveAttribute('src', '/screenshots/feat-vdr-settings.png');

    fireEvent.keyDown(brandingTab, { key: 'End' });
    expect(sessionsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('img')).toHaveAttribute('src', '/screenshots/feat-visitor-sessions.png');
  });

  it('renders localized Chinese tab labels and summaries', () => {
    render(<DataroomWorkflowShowcase locale="zh" />);

    expect(screen.getByRole('tab', { name: '逐项权限矩阵' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    fireEvent.click(screen.getByRole('tab', { name: '隔离文档问答' }));
    expect(screen.getByText(/不同链接的提问彼此严格隔离/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '访客会话审计' }));
    expect(screen.getByText(/单文件或整库打包下载记录/)).toBeInTheDocument();
    expect(screen.queryByText(/点击截图放大查看/)).not.toBeInTheDocument();
  });
});

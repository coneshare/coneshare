import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DataroomDefaultHeroBanner } from '../../../components/viewer/DataroomDefaultHeroBanner';
import '../../../i18n';

describe('DataroomDefaultHeroBanner', () => {
  it('renders dataroom title, description, and public access badge when unrestricted', () => {
    render(
      <DataroomDefaultHeroBanner
        dataroomName="Acme Enterprise Dataroom"
        dataroomId="VR-8492"
        description="Public materials"
        hasViewSession={true}
        isRestricted={false}
      />
    );

    expect(screen.getByText('Acme Enterprise Dataroom')).toBeInTheDocument();
    expect(screen.getByText('Public materials')).toBeInTheDocument();
    expect(screen.getByTestId('hero-public-access-badge')).toBeInTheDocument();
    expect(screen.getByText(/PUBLIC ACCESS/i)).toBeInTheDocument();
    expect(screen.queryByText(/RESTRICTED CONFIDENTIAL/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Share ID/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Virtual Dataroom/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Visitor Mode/i)).not.toBeInTheDocument();
  });

  it('renders restricted confidential badge when isRestricted is true', () => {
    render(
      <DataroomDefaultHeroBanner
        dataroomName="Acme Enterprise Dataroom"
        isRestricted={true}
      />
    );

    expect(screen.getByTestId('hero-restricted-badge')).toBeInTheDocument();
    expect(screen.getByText(/RESTRICTED CONFIDENTIAL/i)).toBeInTheDocument();
    expect(screen.queryByTestId('hero-public-access-badge')).not.toBeInTheDocument();
  });

  it('renders updated timestamp when provided', () => {
    render(
      <DataroomDefaultHeroBanner
        dataroomName="Acme Dataroom"
        updatedAt="2026-10-20T10:00:00Z"
      />
    );

    expect(screen.getByText(/Updated/i)).toBeInTheDocument();
  });

  it('renders watermark and NDA badges when enabled', () => {
    render(
      <DataroomDefaultHeroBanner
        dataroomName="Acme Dataroom"
        isWatermarked={true}
        isNdaProtected={true}
      />
    );

    expect(screen.getByTestId('hero-watermark-badge')).toBeInTheDocument();
    expect(screen.getByTestId('hero-nda-badge')).toBeInTheDocument();
    expect(screen.queryByText(/RESTRICTED CONFIDENTIAL/i)).not.toBeInTheDocument();
  });
});

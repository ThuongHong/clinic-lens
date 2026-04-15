interface PatientNamePromptProps {
    patientNameDraft: string;
    setPatientNameDraft: (value: string) => void;
    onSave: () => void;
}

export function PatientNamePrompt({
    patientNameDraft,
    setPatientNameDraft,
    onSave
}: PatientNamePromptProps) {
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(250, 248, 243, 0.28)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 2000,
            padding: '16px'
        }}>
            <div style={{
                width: 'min(480px, 100%)',
                background: 'rgba(255, 253, 247, 0.98)',
                border: '2px solid var(--border-hi)',
                borderRadius: '16px',
                boxShadow: '0 24px 56px rgba(60, 40, 10, 0.18)',
                padding: '20px',
                display: 'grid',
                gap: '12px'
            }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                    Set patient name
                </div>
                <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
                    This name is used for analysis records and trend tracking.
                </div>
                <input
                    value={patientNameDraft}
                    onChange={(e) => setPatientNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            onSave();
                        }
                    }}
                    placeholder="Enter patient name"
                    maxLength={120}
                    autoFocus
                    style={{
                        width: '100%',
                        height: '40px',
                        borderRadius: '10px',
                        border: '2px solid var(--border-md)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        padding: '0 12px'
                    }}
                    aria-label="Patient name"
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary" type="button" onClick={onSave}>
                        Save and continue
                    </button>
                </div>
            </div>
        </div>
    );
}

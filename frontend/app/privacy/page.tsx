import Link from 'next/link';

export default function PrivacyPage() {
    return (
        <main style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 20px 60px' }}>
            <h1 style={{ fontSize: '1.6rem', marginBottom: '12px' }}>Privacy Policy</h1>
            <p style={{ color: '#475569', lineHeight: 1.7, marginBottom: '14px' }}>
                This local demo stores analysis history on your machine/session for product functionality.
                Do not upload sensitive records unless you understand your deployment and storage settings.
            </p>
            <p style={{ color: '#475569', lineHeight: 1.7, marginBottom: '14px' }}>
                Uploaded files may be sent to configured cloud services for model inference. You are responsible
                for compliance, consent, and data governance in your environment.
            </p>
            <p style={{ color: '#475569', lineHeight: 1.7, marginBottom: '22px' }}>
                Contact your system administrator for retention, deletion, and access policies.
            </p>
            <Link href="/" style={{ color: '#0f766e', textDecoration: 'underline' }}>Back to app</Link>
        </main>
    );
}

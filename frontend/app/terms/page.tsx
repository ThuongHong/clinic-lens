import Link from 'next/link';

export default function TermsPage() {
    return (
        <main style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 20px 60px' }}>
            <h1 style={{ fontSize: '1.6rem', marginBottom: '12px' }}>Terms of Use</h1>
            <p style={{ color: '#475569', lineHeight: 1.7, marginBottom: '14px' }}>
                This application is for informational support and workflow assistance only.
                It does not provide official diagnosis or replace professional medical judgment.
            </p>
            <p style={{ color: '#475569', lineHeight: 1.7, marginBottom: '14px' }}>
                You are responsible for validating outputs, confirming lab values, and ensuring clinical
                decisions are made by qualified professionals.
            </p>
            <p style={{ color: '#475569', lineHeight: 1.7, marginBottom: '22px' }}>
                By using this app, you accept responsibility for secure operation and compliant data handling.
            </p>
            <Link href="/" style={{ color: '#0f766e', textDecoration: 'underline' }}>Back to app</Link>
        </main>
    );
}

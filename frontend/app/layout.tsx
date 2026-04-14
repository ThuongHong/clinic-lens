import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
    title: 'Smart Labs Analyzer — AI-powered clinical lab insights',
    description:
        'Upload lab reports, stream AI analysis, and get clinical follow-up insights powered by Alibaba Cloud and Qwen.',
    openGraph: {
        title: 'Smart Labs Analyzer',
        description: 'AI-powered clinical lab analysis with Alibaba Cloud',
        type: 'website'
    }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <meta name="theme-color" content="#faf8f3" />
            </head>
            <body>{children}</body>
        </html>
    );
}
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google';

import './globals.css';

const display = Space_Grotesk({
    subsets: ['latin'],
    variable: '--font-display'
});

const body = Plus_Jakarta_Sans({
    subsets: ['latin'],
    variable: '--font-body'
});

export const metadata: Metadata = {
    title: 'Smart Labs Analyzer',
    description: 'Web-first Smart Labs Analyzer built with Next.js and Alibaba Cloud.'
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="vi" className={`${display.variable} ${body.variable}`}>
            <body>{children}</body>
        </html>
    );
}
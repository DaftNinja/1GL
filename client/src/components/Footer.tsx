import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 py-6 mt-12 bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs text-slate-400">
        <span>&copy; {new Date().getFullYear()} 1GigLabs Ltd. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link href="/methodology" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors" data-testid="link-methodology">
            Methodology
          </Link>
          <a href="https://www.1giglabs.com/#contact" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors" data-testid="link-contact">
            Contact
          </a>
          <Link href="/privacy" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors" data-testid="link-privacy-policy">
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}

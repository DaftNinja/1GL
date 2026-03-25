import { Link } from "wouter";
import { Map, BookOpen, Mail } from "lucide-react";
import logoUrl from "@/assets/1giglabs-logo.png";
import { UserMenu } from "@/components/UserMenu";
import PowerInfrastructureMap from "@/components/PowerInfrastructureMap";

export default function PowerInfrastructure() {
  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="https://1giglabs.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-white p-1.5 rounded-lg hover:opacity-90 transition-opacity">
              <img src={logoUrl} alt="1GigLabs" className="h-7 w-auto object-contain" data-testid="img-logo" />
            </a>
            <div className="flex items-center gap-1">
              <Map className="w-4 h-4 text-blue-500" />
              <h1 className="text-sm font-semibold text-slate-700" data-testid="text-page-title">Power Infrastructure Map</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/">
              <button className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors px-3 py-2 rounded-lg hover:bg-blue-50" data-testid="button-back-to-trends">
                Power Trends
              </button>
            </Link>
            <Link href="/methodology">
              <button className="flex items-center gap-1.5 text-sm font-medium methodology-glow hover:text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-50" data-testid="button-methodology">
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">Methodology</span>
              </button>
            </Link>
            <a href="https://www.1giglabs.com/#contact" target="_blank" rel="noopener noreferrer" data-testid="button-contact" className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors px-3 py-2 rounded-lg hover:bg-blue-50">
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">Contact</span>
            </a>
            <UserMenu />
          </div>
        </div>
      </nav>

      <main className="flex-1 min-h-0">
        <PowerInfrastructureMap />
      </main>
    </div>
  );
}

import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { ArrowRight, BookOpenCheck, FileCheck2, ShieldCheck, Users } from 'lucide-react';
import { auth, googleProvider } from '../firebase';

export function AuthGate() {
  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setErrorMsg('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to complete Google Sign-In.';
      setErrorMsg(msg);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF9F4] text-[#1C2420] flex flex-col justify-between">
      <header className="border-b border-[#E4DFD3] bg-[#FBF9F4]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span className="font-display text-xl font-semibold tracking-tight text-[#1C2420] whitespace-nowrap shrink-0">
            Estate Ledger
          </span>
          <span className="text-xs text-[#56635C] hidden sm:inline whitespace-nowrap">
            Pre-Need Organization &amp; Executor Administration
          </span>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={signingIn}
            className="px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {signingIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-6xl mx-auto px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center w-full">
          <div className="lg:col-span-7 space-y-6">
            <p className="text-xs font-medium tracking-wider text-[#9C7832]">
              Archival Estate Readiness &amp; Probate Playbook
            </p>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-[#1C2420] leading-[1.12]">
              Calm order before the storm, clear sequence when it matters most.
            </h1>
            <p className="text-base text-[#4F5B54] leading-relaxed max-w-2xl">
              Estate Ledger helps individuals organize accounts, legal originals, insurance policies, and final wishes ahead of time—and guides executors step-by-step through time-sensitive post-death administration.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={signingIn}
                className="inline-flex items-center gap-2.5 px-6 py-3 text-sm font-medium text-white bg-[#1B4332] hover:bg-[#255742] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {signingIn ? 'Connecting to Ledger...' : 'Continue with Google'}
                <ArrowRight className="w-4 h-4" />
              </button>
              <span className="text-xs text-[#56635C]">
                Cloud-synced across family members, co-executors, and legal counsel
              </span>
            </div>

            {errorMsg && (
              <div className="p-3.5 text-sm text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-lg max-w-xl">
                {errorMsg}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-white border border-[#E4DFD3] rounded-xl p-6 sm:p-8 space-y-6">
            <div className="border-b border-[#E4DFD3] pb-4">
              <h2 className="font-display text-lg font-semibold text-[#1C2420]">
                Inside Your Estate Ledger
              </h2>
              <p className="text-xs text-[#56635C] mt-1">
                Seeded with a 21-step playbook across seven core estate domains
              </p>
            </div>

            <div className="space-y-5">
              <div className="flex items-start gap-3.5">
                <BookOpenCheck className="w-5 h-5 text-[#1B4332] shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-[#1C2420]">Seven-Bucket Playbook &amp; Timeline</div>
                  <p className="text-xs text-[#56635C] mt-0.5 leading-relaxed">
                    Track Assets, Liabilities, Cashflow, Legal &amp; Probate, Insurance, Digital &amp; Access, and Final Wishes with due-date reminders.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <FileCheck2 className="w-5 h-5 text-[#1B4332] shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-[#1C2420]">SHA-256 Verified Document Vault</div>
                  <p className="text-xs text-[#56635C] mt-0.5 leading-relaxed">
                    Attach wills, deeds, statements, and policies directly to tasks or categories with inline previews and checksums.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <Users className="w-5 h-5 text-[#1B4332] shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-[#1C2420]">Role-Based Family &amp; Counsel Access</div>
                  <p className="text-xs text-[#56635C] mt-0.5 leading-relaxed">
                    Invite co-executors, family members, or attorneys with View &amp; Update or View Only permissions.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <ShieldCheck className="w-5 h-5 text-[#9C7832] shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-[#1C2420]">Legal Meeting PDF &amp; AI Consultant</div>
                  <p className="text-xs text-[#56635C] mt-0.5 leading-relaxed">
                    Export US-Letter attorney briefings and draft institution notices grounded in your live readiness counts.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-[#E4DFD3] py-4 px-6 text-center text-xs text-[#78827B]">
        Estate Ledger · Archival Planning &amp; Executor Workspace
      </footer>
    </div>
  );
}

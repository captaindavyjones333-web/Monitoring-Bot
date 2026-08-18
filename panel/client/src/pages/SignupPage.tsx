import { useState } from "react";
import { Link, useNavigate } from "react-router";
import Logo from "../components/Logo";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setError("");
    // Simulate successful signup
    navigate("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center justify-center mb-8 text-center">
          <Logo size="lg" />
          <p className="text-sm text-muted mt-3">Create an admin account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-line rounded-2xl p-7 shadow-xs flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-ink">
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all placeholder:text-muted/60"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-ink">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@redstore.am"
              className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all placeholder:text-muted/60"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-ink">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all placeholder:text-muted/60"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPassword" className="text-xs font-semibold uppercase tracking-wider text-ink">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 transition-all placeholder:text-muted/60"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-brand/20 bg-brand-soft text-brand text-xs font-semibold px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="mt-2 bg-brand hover:bg-brand-hover text-white text-sm font-semibold rounded-xl py-3 transition-all shadow-xs cursor-pointer"
          >
            Create account
          </button>
        </form>

        <p className="text-center text-sm text-muted mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-brand font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
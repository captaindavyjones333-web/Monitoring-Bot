import { useState } from "react";
import { Link, useNavigate } from "react-router";
import Logo from "../components/Logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    // Simulate successful login
    navigate("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center justify-center mb-8 text-center">
          <Logo size="lg" />
          <p className="text-sm text-muted mt-3">Sign in to your admin account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-line rounded-2xl p-7 shadow-xs flex flex-col gap-4"
        >
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

          <button
            type="submit"
            className="mt-2 bg-brand hover:bg-brand-hover text-white text-sm font-semibold rounded-xl py-3 transition-all shadow-xs cursor-pointer"
          >
            Sign in
          </button>
        </form>

        <p className="text-center text-sm text-muted mt-6">
          Don't have an account?{" "}
          <Link to="/signup" className="text-brand font-semibold hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
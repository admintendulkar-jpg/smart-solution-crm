export function Spinner({ dark = true }: { dark?: boolean }) {
  return (
    <div className="spinner-center">
      <span className={`spinner ${dark ? 'spinner-dark' : ''}`} />
    </div>
  );
}

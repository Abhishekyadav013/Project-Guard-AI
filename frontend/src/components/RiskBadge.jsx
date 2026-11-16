export default function RiskBadge({ level }) {
  const safeLevel = (level || 'Low').toLowerCase();
  return (
    <span className={`risk-badge ${safeLevel}`}>
      {level || 'Low'}
    </span>
  );
}

export default function Sources({ sources = [] }) {
  if (!sources.length) return null;
  return (
    <div className="learn-sources">
      <strong>Sources</strong>
      <ul>{sources.map((source, index) => (
        <li key={`${source.filename}-${source.location}-${index}`}>
          {source.filename} <span>{source.location}</span>
        </li>
      ))}</ul>
    </div>
  );
}

import { useState, type FormEvent } from 'react';

export function LabelEditor({
  labels,
  suggestions,
  onAdd,
  onRemove,
}: {
  labels: string[];
  suggestions: string[];
  onAdd: (label: string) => void;
  onRemove: (label: string) => void;
}) {
  const [value, setValue] = useState('');
  const [adding, setAdding] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.trim()) onAdd(value);
    setValue('');
    setAdding(false);
  }

  const unused = suggestions.filter((item) => !labels.includes(item));

  return (
    <div className="label-row" aria-label="Labels">
      {labels.map((label) => (
        <span key={label} className="label-chip">
          {label}
          <button type="button" onClick={() => onRemove(label)} aria-label={`Remove label ${label}`}>
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <form className="label-form" onSubmit={submit}>
          <input
            autoFocus
            list="label-suggestions"
            type="text"
            maxLength={40}
            placeholder="Label name"
            aria-label="New label"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => {
              if (!value.trim()) setAdding(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setValue('');
                setAdding(false);
              }
            }}
          />
          {unused.length > 0 && (
            <datalist id="label-suggestions">
              {unused.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          )}
          <button type="submit" className="btn btn-small">
            Add
          </button>
        </form>
      ) : (
        <button type="button" className="chip chip-add" onClick={() => setAdding(true)}>
          + Label
        </button>
      )}
    </div>
  );
}

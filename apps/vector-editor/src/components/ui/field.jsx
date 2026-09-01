export function Field({ label, className, children }) {
  return (
    <div className={className ? `field-row ${className}` : 'field-row'}>
      <label>{label}</label>
      {children}
    </div>
  );
}

export function RangeField({ label, value, min, max, step = 1, onChange, format = (v) => v, ...rest }) {
  return (
    <div className="field-row">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} {...rest} />
      <span className="field-val">{format(value)}</span>
    </div>
  );
}

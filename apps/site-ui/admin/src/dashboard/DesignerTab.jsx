import { useEffect, useRef } from 'react';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Field } from './designer/Field.jsx';
import { useSiteDesigner } from './hooks.js';
import { cn } from '../lib/utils.js';

export function DesignerTab() {
  const {
    schema,
    values,
    status,
    busy,
    error,
    dirty,
    previewUrl,
    selectedObjectId,
    iframeRef,
    setFieldValue,
    publishAll,
    resetLocal,
  } = useSiteDesigner();

  const objectRefs = useRef({});

  useEffect(() => {
    if (selectedObjectId && objectRefs.current[selectedObjectId]) {
      objectRefs.current[selectedObjectId].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedObjectId]);

  if (!schema || !values) {
    return <p className="text-sm text-[var(--text-dim)]">Loading&hellip;</p>;
  }

  const hasPreview = !!(previewUrl || status?.hasDraft);
  // ?designer=1 activates DesignerBridge (click-to-select overlay) in the
  // preview build only - the real published site is never loaded with this
  // param, so the bridge code never activates there.
  const previewSrc = previewUrl ? `${previewUrl}&designer=1` : '/site-designer-preview/?designer=1';

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start">
      <div className="flex flex-col gap-4">
        {schema.sections.map((section) => (
          <Card key={section.id}>
            <CardContent>
              <h3 className="mb-1 text-[0.78rem] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                {section.label}
              </h3>
              {section.objects.map((object) => (
                <div
                  key={object.id}
                  ref={(el) => (objectRefs.current[object.id] = el)}
                  className={cn(
                    'rounded-lg transition-shadow',
                    selectedObjectId === object.id && 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--panel-solid)]'
                  )}
                >
                  {object.fields.map((field) => (
                    <Field
                      key={field.id}
                      field={field}
                      value={values[section.id]?.[object.id]?.[field.id]}
                      onChange={(fieldId, v) => setFieldValue(section.id, object.id, fieldId, v)}
                    />
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-6">
        <Card className="overflow-hidden">
          {hasPreview ? (
            <iframe
              ref={iframeRef}
              key={previewSrc}
              src={previewSrc}
              title="Landing page preview"
              className="h-[64vh] w-full border-0 bg-white"
            />
          ) : (
            <CardContent className="flex h-[64vh] items-center justify-center text-center text-sm text-[var(--text-dim)]">
              Loading preview&hellip;
            </CardContent>
          )}
        </Card>

        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[var(--text-faint)]">
              {dirty ? (
                <span className="font-medium text-[var(--warn)]">Live preview only &mdash; not yet published</span>
              ) : (
                <span>
                  Live at <span className="font-mono">{status?.landingGitHead || '–'}</span>
                </span>
              )}
              {error && <div className="mt-1 text-[var(--bad)]">{error}</div>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={resetLocal} disabled={busy || !dirty}>
                Reset
              </Button>
              <Button size="sm" onClick={publishAll} disabled={busy || !dirty}>
                Publish
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { SUPPORTED_LOCALES } from "@/lib/locales";
import { saveTemplate, deleteTemplate, type TemplateActionState } from "./actions";

const input = "w-full rounded-md border border-[color:var(--color-line)] bg-white px-2 py-1.5 text-sm";
const CATEGORIES = ["ATTENDANCE", "FINANCE", "ACADEMICS", "ADMISSIONS", "ANNOUNCEMENT", "SECURITY", "BILLING"];
const CLASSIFICATIONS = ["PUBLIC", "INTERNAL", "SENSITIVE"];

type Template = {
  id: string; code: string; locale: string; name: string; category: string;
  dataClassification: string; titleTemplate: string; bodyTemplate: string;
};

function Result({ state }: { state: TemplateActionState }) {
  if (state.error) return <p role="alert" className="mt-2 text-sm text-red-600">{state.error}</p>;
  if (state.message) return <p role="status" className="mt-2 text-sm text-green-700">{state.message}</p>;
  return null;
}

function renderPreview(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function TemplateForm({ template, onDone }: { template?: Template; onDone?: () => void }) {
  const [state, action, pending] = useActionState(saveTemplate, {});
  const [title, setTitle] = useState(template?.titleTemplate ?? "");
  const [body, setBody] = useState(template?.bodyTemplate ?? "");
  const sampleVars = { studentName: "Alex Chen", campusName: "Main Campus", date: "18 Nov 2026", amount: "KES 5,000", link: "https://portal/", term: "Term 1" };

  return (
    <form action={action} className="space-y-3 rounded border p-4">
      {template && <input type="hidden" name="id" value={template.id} />}
      <h3 className="font-semibold">{template ? "Edit template" : "New template"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Code (read-only after creation)</label>
          <input name="code" defaultValue={template?.code} required readOnly={!!template} placeholder="fee.invoice.issued" className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Language (read-only after creation)</label>
          {template && <input type="hidden" name="locale" value={template.locale} />}
          <select name="locale" defaultValue={template?.locale ?? "en"} disabled={!!template} className={input}>
            {SUPPORTED_LOCALES.map(l => <option key={l.code} value={l.code}>{l.label} ({l.code})</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Display name</label>
          <input name="name" defaultValue={template?.name} required placeholder="Fee invoice issued" className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Category</label>
          <select name="category" defaultValue={template?.category ?? "ANNOUNCEMENT"} className={input}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Data classification</label>
          <select name="dataClassification" defaultValue={template?.dataClassification ?? "INTERNAL"} className={input}>
            {CLASSIFICATIONS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Subject / title — use {"{{variable}}"}</label>
        <input name="titleTemplate" value={title} onChange={e => setTitle(e.target.value)} required placeholder="New invoice for {{studentName}}" className={input} />
        {title && <p className="mt-1 text-xs text-[color:var(--color-muted)]">Preview: {renderPreview(title, sampleVars)}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Body — use {"{{variable}}"}</label>
        <textarea name="bodyTemplate" value={body} onChange={e => setBody(e.target.value)} required rows={4} placeholder="Dear {{studentName}}, an invoice of {{amount}} has been raised for {{term}}." className={input} />
        {body && <p className="mt-1 whitespace-pre-line text-xs text-[color:var(--color-muted)]">Preview: {renderPreview(body, sampleVars)}</p>}
      </div>
      <p className="text-xs text-[color:var(--color-muted)]">
        Available variables: {"{{studentName}}"} {"{{campusName}}"} {"{{date}}"} {"{{amount}}"} {"{{link}}"} {"{{term}}"}
      </p>
      <div className="flex gap-2">
        <button disabled={pending} className="rounded bg-brand-600 px-4 py-2 text-sm text-white">{pending ? "Saving…" : template ? "Update" : "Create"}</button>
        {onDone && <button type="button" onClick={onDone} className="text-sm text-slate-600">Cancel</button>}
      </div>
      <Result state={state} />
    </form>
  );
}

function TemplateRow({ template }: { template: Template }) {
  const [editing, setEditing] = useState(false);
  const [delState, delAction, deleting] = useActionState(deleteTemplate, {});

  if (editing) return <div className="border-b"><TemplateForm template={template} onDone={() => setEditing(false)} /></div>;

  return (
    <div className="border-b border-[color:var(--color-line)] p-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{template.name}</p>
          <p className="font-mono text-xs text-[color:var(--color-muted)]">{template.code} · {template.locale}</p>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">{template.titleTemplate}</p>
          <p className="mt-0.5 text-xs text-[color:var(--color-muted)]">{template.category} · {template.dataClassification}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className="text-sm text-brand-700">Edit</button>
          <form action={delAction}>
            <input type="hidden" name="id" value={template.id} />
            <button disabled={deleting} className="text-sm text-red-700">Delete</button>
          </form>
        </div>
      </div>
      {delState.error && <p className="mt-1 text-sm text-red-600">{delState.error}</p>}
    </div>
  );
}

export function TemplateManager({ templates }: { templates: Template[] }) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[color:var(--color-muted)]">
            Templates are reusable notification bodies with {"{{variable}}"} placeholders. Add one per language under the same code; each recipient gets their own language, falling back to the organization default, then English. They are referenced by code from server actions via <code className="text-xs">notifyFromTemplate()</code>.
          </p>
        </div>
        <button onClick={() => setCreating(!creating)} className="shrink-0 rounded bg-brand-600 px-3 py-1.5 text-sm text-white">
          {creating ? "Cancel" : "New template"}
        </button>
      </div>
      {creating && <TemplateForm onDone={() => setCreating(false)} />}
      <div className="rounded border">
        {templates.length === 0 && !creating && (
          <p className="p-6 text-center text-sm text-[color:var(--color-muted)]">No templates yet. Create one to start customising notification messages.</p>
        )}
        {templates.map(t => <TemplateRow key={t.id} template={t} />)}
      </div>
    </div>
  );
}

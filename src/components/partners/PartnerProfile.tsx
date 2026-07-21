"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Partner, PartnerChannel } from "@/lib/partners";
import { parseTags } from "@/lib/partners";
import { PLATFORM_META, type Platform } from "@/lib/types";
import { views as fmtViews } from "@/lib/format";
import {
  archivePartnerAction,
  deleteChannelAction,
  saveChannelAction,
  updatePartnerAction,
} from "@/app/partners/actions";

const inputClass =
  "w-full border border-slate-200 rounded-md bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";

const PLATFORMS: Platform[] = ["youtube", "instagram", "tiktok"];

export default function PartnerProfile({
  partner,
  channels,
}: {
  partner: Partner;
  channels: PartnerChannel[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: partner.name,
    email: partner.email ?? "",
    phone: partner.phone ?? "",
    notes: partner.notes ?? "",
    tags: parseTags(partner.tags).join(", "),
  });
  const [newChannel, setNewChannel] = useState<{ platform: Platform; handle: string; url: string } | null>(
    null
  );

  const saveProfile = () => {
    setError(null);
    startTransition(async () => {
      const result = await updatePartnerAction(partner.id, {
        name: form.name,
        email: form.email,
        phone: form.phone,
        notes: form.notes,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      if (result.error) setError(result.error);
      else setEditing(false);
    });
  };

  const addChannel = () => {
    if (!newChannel) return;
    startTransition(async () => {
      await saveChannelAction({
        partnerId: partner.id,
        platform: newChannel.platform,
        handle: newChannel.handle || undefined,
        url: newChannel.url || undefined,
      });
      setNewChannel(null);
    });
  };

  const archive = () => {
    if (!window.confirm(`Archive ${partner.name}? Their deals stay, but they leave the partner list.`)) return;
    startTransition(async () => {
      await archivePartnerAction(partner.id);
      router.push("/partners");
    });
  };

  const tags = parseTags(partner.tags);

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      {editing ? (
        <div className="space-y-2.5">
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" />
          <input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
          <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" />
          <input className={inputClass} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags, comma separated" />
          <textarea
            className={`${inputClass} resize-y`}
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notes — how they work, what they've asked for, anything worth remembering"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={saveProfile}
              disabled={isPending}
              className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-4 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)} className="text-sm font-medium text-slate-500 hover:text-slate-900 px-2">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-headline text-lg font-semibold text-slate-900">{partner.name}</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {partner.email || "no email"}
                {partner.phone ? ` · ${partner.phone}` : ""}
              </p>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((t) => (
                    <span key={t} className="text-[11px] font-medium bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setEditing(true)} className="text-xs font-medium text-slate-500 hover:text-slate-900">
                Edit
              </button>
              <button onClick={archive} className="text-xs font-medium text-slate-400 hover:text-red-600">
                Archive
              </button>
            </div>
          </div>
          {partner.notes && (
            <p className="text-sm text-slate-600 mt-3 whitespace-pre-line border-t border-slate-100 pt-3">
              {partner.notes}
            </p>
          )}
        </>
      )}

      {/* Channels */}
      <div className="border-t border-slate-100 mt-4 pt-4">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="font-headline text-sm font-semibold text-slate-900">Channels</h3>
          {!newChannel && (
            <button
              onClick={() => setNewChannel({ platform: "youtube", handle: "", url: "" })}
              className="text-xs font-semibold text-brand-dark hover:underline"
            >
              + Add channel
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          {channels.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5 text-sm">
              <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 16 }}>
                {PLATFORM_META[c.platform]?.icon ?? "public"}
              </span>
              <span className="text-slate-700">{c.handle || PLATFORM_META[c.platform]?.label || c.platform}</span>
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer" className="text-xs text-brand-dark hover:underline truncate max-w-[16rem]">
                  {c.url}
                </a>
              )}
              <span className="text-xs text-slate-400 font-tabular ml-auto">
                {c.avg_views != null ? `${fmtViews(c.avg_views)} avg` : ""}
                {c.engagement_rate != null ? ` · ${c.engagement_rate}% ER` : ""}
              </span>
              <button
                onClick={() =>
                  startTransition(async () => {
                    await deleteChannelAction(c.id, partner.id);
                  })
                }
                className="text-slate-300 hover:text-red-600"
                title="Remove channel"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
              </button>
            </div>
          ))}
          {channels.length === 0 && !newChannel && (
            <p className="text-xs text-slate-400">No channels recorded.</p>
          )}
        </div>

        {newChannel && (
          <div className="flex items-center gap-2 mt-2">
            <select
              className={`${inputClass} w-32`}
              value={newChannel.platform}
              onChange={(e) => setNewChannel({ ...newChannel, platform: e.target.value as Platform })}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_META[p].label}
                </option>
              ))}
            </select>
            <input
              className={`${inputClass} w-36`}
              placeholder="@handle"
              value={newChannel.handle}
              onChange={(e) => setNewChannel({ ...newChannel, handle: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="https://…"
              value={newChannel.url}
              onChange={(e) => setNewChannel({ ...newChannel, url: e.target.value })}
            />
            <button
              onClick={addChannel}
              disabled={isPending}
              className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-3 text-sm font-medium disabled:opacity-60"
            >
              Add
            </button>
            <button onClick={() => setNewChannel(null)} className="text-sm text-slate-500 hover:text-slate-900 px-1">
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

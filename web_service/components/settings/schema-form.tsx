'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AttributeDef {
  name: string;
  type: string;
  description: string;
}

export interface TypeDef {
  name: string;
  description: string;
  attributes: AttributeDef[];
}

export interface SchemaForm {
  name: string;
  description: string;
  entity_types: TypeDef[];
  edge_types: TypeDef[];
  custom_instructions: string;
}

export interface SchemaDetail extends SchemaForm {
  id: number;
  created_at: string;
  updated_at: string;
}

interface SchemaFormEditorProps {
  title: string;
  initialData?: SchemaDetail;
  onSubmit: (data: SchemaForm) => Promise<void>;
  submitLabel: string;
}

const EMPTY_FORM: SchemaForm = {
  name: '',
  description: '',
  entity_types: [],
  edge_types: [],
  custom_instructions: '',
};

/** Filter out types and attributes with empty names before saving. */
function cleanForm(form: SchemaForm): SchemaForm {
  const cleanTypes = (types: TypeDef[]) =>
    types
      .filter((t) => t.name.trim())
      .map((t) => ({
        ...t,
        attributes: t.attributes.filter((a) => a.name.trim()),
      }));
  return {
    ...form,
    entity_types: cleanTypes(form.entity_types),
    edge_types: cleanTypes(form.edge_types),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SchemaFormEditor({
  title,
  initialData,
  onSubmit,
  submitLabel,
}: SchemaFormEditorProps) {
  const router = useRouter();
  const [form, setForm] = useState<SchemaForm>(() => {
    if (!initialData) return { ...EMPTY_FORM };
    return {
      name: initialData.name,
      description: initialData.description,
      entity_types: initialData.entity_types.map((et) => ({
        ...et,
        attributes: et.attributes ?? [],
      })),
      edge_types: initialData.edge_types.map((et) => ({
        ...et,
        attributes: et.attributes ?? [],
      })),
      custom_instructions: initialData.custom_instructions,
    };
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form helpers
  const updateForm = (patch: Partial<SchemaForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const addType = (kind: 'entity_types' | 'edge_types') => {
    updateForm({ [kind]: [...form[kind], { name: '', description: '', attributes: [] }] });
  };

  const updateType = (kind: 'entity_types' | 'edge_types', idx: number, patch: Partial<TypeDef>) => {
    const list = [...form[kind]];
    list[idx] = { ...list[idx], ...patch };
    updateForm({ [kind]: list });
  };

  const removeType = (kind: 'entity_types' | 'edge_types', idx: number) => {
    updateForm({ [kind]: form[kind].filter((_, i) => i !== idx) });
  };

  const addAttribute = (kind: 'entity_types' | 'edge_types', typeIdx: number) => {
    const list = [...form[kind]];
    list[typeIdx] = {
      ...list[typeIdx],
      attributes: [...list[typeIdx].attributes, { name: '', type: 'str', description: '' }],
    };
    updateForm({ [kind]: list });
  };

  const updateAttribute = (
    kind: 'entity_types' | 'edge_types',
    typeIdx: number,
    attrIdx: number,
    patch: Partial<AttributeDef>,
  ) => {
    const list = [...form[kind]];
    const attrs = [...list[typeIdx].attributes];
    attrs[attrIdx] = { ...attrs[attrIdx], ...patch };
    list[typeIdx] = { ...list[typeIdx], attributes: attrs };
    updateForm({ [kind]: list });
  };

  const removeAttribute = (
    kind: 'entity_types' | 'edge_types',
    typeIdx: number,
    attrIdx: number,
  ) => {
    const list = [...form[kind]];
    list[typeIdx] = {
      ...list[typeIdx],
      attributes: list[typeIdx].attributes.filter((_, i) => i !== attrIdx),
    };
    updateForm({ [kind]: list });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit(cleanForm(form));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // Stats for right panel
  const totalAttributes =
    form.entity_types.reduce((sum, t) => sum + t.attributes.length, 0) +
    form.edge_types.reduce((sum, t) => sum + t.attributes.length, 0);
  const typesWithAttrs =
    form.entity_types.filter((t) => t.attributes.length > 0).length +
    form.edge_types.filter((t) => t.attributes.length > 0).length;

  // -------------------------------------------------------------------------
  // Type editor
  // -------------------------------------------------------------------------

  const renderTypeEditor = (kind: 'entity_types' | 'edge_types', label: string) => {
    const types = form[kind];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{label}</Label>
          <Button variant="outline" size="sm" onClick={() => addType(kind)}>
            <Plus className="mr-1 h-3 w-3" />
            添加
          </Button>
        </div>
        {types.map((t, tIdx) => (
          <Card key={tIdx} className="border-dashed">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-0">
              <Input
                placeholder="类型名称 (e.g. Person)"
                value={t.name}
                onChange={(e) => updateType(kind, tIdx, { name: e.target.value })}
                className={cn(
                  'h-7 w-48 text-xs font-medium',
                  !t.name.trim() && 'border-destructive',
                )}
              />
              <Button variant="ghost" size="icon" onClick={() => removeType(kind, tIdx)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-2">
              <Input
                placeholder="描述 (e.g. A specific human being...)"
                value={t.description}
                onChange={(e) => updateType(kind, tIdx, { description: e.target.value })}
                className="h-7 text-xs"
              />
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">属性 (可选)</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() => addAttribute(kind, tIdx)}
                  >
                    <Plus className="mr-0.5 h-2.5 w-2.5" />
                    属性
                  </Button>
                </div>
                {t.attributes.map((attr, aIdx) => (
                  <div key={aIdx} className="flex items-center gap-1.5">
                    <Input
                      placeholder="字段名"
                      value={attr.name}
                      onChange={(e) =>
                        updateAttribute(kind, tIdx, aIdx, { name: e.target.value })
                      }
                      className={cn(
                        'h-6 flex-1 text-[11px]',
                        !attr.name.trim() && 'border-destructive',
                      )}
                    />
                    {/* 自定义 select —— 兼容 Chrome / Safari / Firefox 的原生外观差异 */}
                    <div className="relative inline-flex shrink-0 items-center">
                      <select
                        value={attr.type}
                        onChange={(e) =>
                          updateAttribute(kind, tIdx, aIdx, { type: e.target.value })
                        }
                        aria-label="属性类型"
                        className={cn(
                          'h-6 w-16 appearance-none rounded border bg-background py-0 pl-1.5 pr-5 text-[11px] text-foreground',
                          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        )}
                      >
                        <option value="str">str</option>
                        <option value="int">int</option>
                        <option value="float">float</option>
                        <option value="bool">bool</option>
                      </select>
                      {/* 自定义下拉箭头（pointer-events-none 不拦截点击） */}
                      <svg
                        aria-hidden="true"
                        className="pointer-events-none absolute right-1 h-3 w-3 text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                    <Input
                      placeholder="描述"
                      value={attr.description}
                      onChange={(e) =>
                        updateAttribute(kind, tIdx, aIdx, { description: e.target.value })
                      }
                      className="h-6 flex-1 text-[11px]"
                    />
                    <button
                      type="button"
                      aria-label="删除属性"
                      onClick={() => removeAttribute(kind, tIdx, aIdx)}
                      className="shrink-0 text-destructive hover:opacity-70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {types.length === 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">
            暂无类型，点击上方添加
          </p>
        )}
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" aria-label="返回" onClick={() => router.push('/settings/schemas')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-xs text-muted-foreground">定义实体类型、关系类型和提取指令</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push('/settings/schemas')}>
          取消
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>

      {/* Left + Right split — 小屏时改为上下堆叠 */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left panel — Form */}
        <div className="w-full overflow-y-auto border-b lg:w-[55%] lg:min-w-[380px] lg:border-b-0 lg:border-r px-6 py-5">
        <div className="space-y-5">
          {saveError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2">
              <p className="text-sm text-destructive">{saveError}</p>
            </div>
          )}

          {/* Name + Description */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">名称</Label>
              <Input
                value={form.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder="e.g. crime"
                className={cn('h-8 text-xs', !form.name.trim() && 'border-destructive')}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">描述</Label>
              <Input
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
                placeholder="e.g. 犯罪调查领域知识图谱"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {renderTypeEditor('entity_types', 'Entity Types（实体类型）')}
          {renderTypeEditor('edge_types', 'Edge Types（关系类型）')}

          <div className="space-y-1">
            <Label className="text-xs">自定义提取指令</Label>
            <textarea
              value={form.custom_instructions}
              onChange={(e) => updateForm({ custom_instructions: e.target.value })}
              placeholder="e.g. 重点关注人物之间的社会关系网络"
              className={cn(
                'h-20 w-full resize-y rounded-md border bg-background p-2 text-xs text-foreground',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              )}
            />
          </div>
        </div>
      </div>

      {/* Right panel — Live overview */}
      <div className="flex flex-1 flex-col overflow-y-auto bg-muted/30 px-6 py-5">
        <h3 className="mb-4 text-sm font-semibold">Schema 概览</h3>

        {/* Stats */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-lg border bg-background p-4 text-center">
            <div className="text-2xl font-semibold text-primary">{form.entity_types.length}</div>
            <div className="text-xs text-muted-foreground">实体类型</div>
          </div>
          <div className="rounded-lg border bg-background p-4 text-center">
            <div className="text-2xl font-semibold text-primary">{form.edge_types.length}</div>
            <div className="text-xs text-muted-foreground">关系类型</div>
          </div>
          <div className="rounded-lg border bg-background p-4 text-center">
            <div className="text-2xl font-semibold text-primary">{totalAttributes}</div>
            <div className="text-xs text-muted-foreground">属性字段</div>
          </div>
          <div className="rounded-lg border bg-background p-4 text-center">
            <div className="text-2xl font-semibold text-primary">{typesWithAttrs}</div>
            <div className="text-xs text-muted-foreground">类型含属性</div>
          </div>
        </div>

        {/* Entity types list */}
        {form.entity_types.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              实体类型
            </h4>
            <div className="space-y-2">
              {form.entity_types.map((t, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg border bg-background p-3"
                >
                  <Badge variant="secondary" className="mt-0.5 shrink-0 text-[10px]">
                    Entity
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t.name || '(未命名)'}</div>
                    {t.description && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>
                    )}
                    {t.attributes.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.attributes.map((a, j) => (
                          <span
                            key={j}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {a.name || '?'}: {a.type}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Edge types list */}
        {form.edge_types.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              关系类型
            </h4>
            <div className="space-y-2">
              {form.edge_types.map((t, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg border bg-background p-3"
                >
                  <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px]">
                    Edge
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t.name || '(未命名)'}</div>
                    {t.description && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>
                    )}
                    {t.attributes.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.attributes.map((a, j) => (
                          <span
                            key={j}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {a.name || '?'}: {a.type}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom instructions */}
        {form.custom_instructions && (
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              提取指令
            </h4>
            <div className="rounded-lg border bg-background p-3 text-xs italic text-muted-foreground leading-relaxed">
              {form.custom_instructions}
            </div>
          </div>
        )}

        {/* Empty state */}
        {form.entity_types.length === 0 &&
          form.edge_types.length === 0 &&
          !form.custom_instructions && (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-center text-xs text-muted-foreground">
                在左侧添加类型后，概览将在此显示
              </p>
            </div>
          )}
      </div>
      </div>
    </div>
  );
}

// Re-export helpers for page usage
export { cleanForm, EMPTY_FORM };

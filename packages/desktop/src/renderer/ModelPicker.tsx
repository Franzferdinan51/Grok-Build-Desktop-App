import { createEffect, createSignal, For, Show, onCleanup } from "solid-js"
import type { ModelOption } from "./provider-availability"
import { filterModelGroups, flattenModelOptions, modelDisplayName, modelPickerLabel } from "./model-picker"
import "./model-picker.css"

export function ModelPicker(props: {
  value: string
  emptyLabel: string
  options: ModelOption[]
  onChange: (value: string) => void
  onOpen?: () => void
  onNeedSettings?: () => void
  compact?: boolean
}) {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [active, setActive] = createSignal(0)
  let root: HTMLDivElement | undefined
  let search: HTMLInputElement | undefined

  const groups = () => filterModelGroups(props.options, query())
  const flat = () => flattenModelOptions(groups())
  const selected = () => props.options.find((option) => option.id === props.value)

  const close = () => { setOpen(false); setQuery(""); setActive(0) }
  const openPicker = () => {
    setOpen(true)
    setQuery("")
    const index = Math.max(0, flat().findIndex((option) => option.id === props.value))
    setActive(index)
    props.onOpen?.()
    queueMicrotask(() => search?.focus())
  }

  const choose = (option: ModelOption) => {
    if (!option.available) {
      props.onNeedSettings?.()
      return
    }
    props.onChange(option.id)
    close()
  }

  const move = (delta: number) => {
    const count = flat().length
    if (!count) return
    setActive((index) => (index + delta + count) % count)
  }

  createEffect(() => {
    if (!open()) return
    const onPointer = (event: PointerEvent) => {
      if (root && !root.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close() }
    }
    window.addEventListener("pointerdown", onPointer)
    window.addEventListener("keydown", onKey)
    onCleanup(() => {
      window.removeEventListener("pointerdown", onPointer)
      window.removeEventListener("keydown", onKey)
    })
  })

  return <div class={`model-picker ${props.compact ? "model-picker--compact" : ""} ${open() ? "model-picker--open" : ""}`} ref={root}>
    <button type="button" class="model-picker__trigger" aria-haspopup="listbox" aria-expanded={open()} title={selected()?.id || props.emptyLabel} onClick={() => open() ? close() : openPicker()}>
      <span class="model-picker__family">{selected()?.family ? selected()!.family : "model"}</span>
      <strong>{modelPickerLabel(props.value, props.emptyLabel)}</strong>
      <i />
    </button>
    <Show when={open()}>
      <div class="model-picker__menu" role="listbox" aria-label="Grok Build models">
        <input
          ref={search}
          value={query()}
          placeholder="Search models…"
          aria-label="Search models"
          onInput={(event) => { setQuery(event.currentTarget.value); setActive(0) }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); move(1) }
            else if (event.key === "ArrowUp") { event.preventDefault(); move(-1) }
            else if (event.key === "Enter") {
              event.preventDefault()
              const option = flat()[active()]
              if (option) choose(option)
            }
          }}
        />
        <div class="model-picker__list">
          <button type="button" class={`model-picker__option ${!props.value ? "is-selected" : ""}`} onClick={() => { props.onChange(""); close() }}>
            <strong>{props.emptyLabel}</strong>
            <span>Use the Grok Build default</span>
          </button>
          <For each={groups()}>{(group) =>
            <section>
              <header>{group.label}</header>
              <For each={group.options}>{(option) => {
                const index = () => flat().findIndex((entry) => entry.id === option.id)
                return <button
                  type="button"
                  role="option"
                  aria-selected={option.id === props.value}
                  disabled={!option.available}
                  class={`model-picker__option ${option.id === props.value ? "is-selected" : ""} ${index() === active() ? "is-active" : ""} ${option.available ? "" : "is-locked"}`}
                  onMouseEnter={() => setActive(index())}
                  onClick={() => choose(option)}
                  title={option.reason || option.id}
                >
                  <strong>{modelDisplayName(option.id)}</strong>
                  <span>{option.available ? option.id : option.reason || option.id}</span>
                </button>
              }}</For>
            </section>
          }</For>
          <Show when={!flat().length}><p>No models match that search.</p></Show>
        </div>
      </div>
    </Show>
  </div>
}

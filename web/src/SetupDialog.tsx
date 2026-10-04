import { useEffect, useRef } from "react";
import PresetEditor from "./PresetEditor";
import type { ComponentProps } from "react";
export default function SetupDialog(props: ComponentProps<typeof PresetEditor>) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const prior = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => { dialog.current?.close(); prior?.focus(); }; }, []);
  return <dialog className="setup-dialog" ref={dialog} onCancel={e => { e.preventDefault(); props.onClose(); }} aria-label={props.onboarding ? "Pierwsze uruchomienie" : "Edytuj zestaw"}>
    <PresetEditor {...props} />
  </dialog>;
}

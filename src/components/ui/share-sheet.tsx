"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FiShare } from "react-icons/fi";
import { cn } from "@/lib/utils";

interface User {
  id: string;
  name: string;
  icon: ReactNode;
}

interface ShareSheetProps {
  users: User[];
  onShareComplete?: (user: User) => void;
  triggerLabel?: string;
  renderTrigger?: (trigger: { readonly label: string; readonly onClick: () => void }) => ReactNode;
}

const springTransition = {
  type: "spring",
  stiffness: 240,
  damping: 20,
  mass: 1,
} as const;

export const ShareSheet = ({ users, onShareComplete, triggerLabel = "공유하기", renderTrigger }: ShareSheetProps) => {
  const [status, setStatus] = useState<"idle" | "open" | "sending" | "success">(
    "idle"
  );
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const radius = 22;
  const circumference = 2 * Math.PI * radius;

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setStatus("sending");

    setTimeout(() => {
      setStatus("success");

      setTimeout(() => {
        setStatus("idle");
        setSelectedUser(null);
        onShareComplete?.(user);
      }, 800);
    }, 1800);
  };

  const openSheet = () => {
    if (status === "idle") setStatus("open");
  };

  return (
    <div className="relative flex items-center justify-start">
      {renderTrigger ? renderTrigger({ label: triggerLabel, onClick: openSheet }) : <motion.button
        onClick={openSheet}
        aria-label={triggerLabel}
        className="relative flex h-12 items-center justify-center gap-2 overflow-hidden rounded-full bg-[#0a152d] px-5 text-sm font-semibold text-neutral-50 shadow-sm"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springTransition}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {status === "idle" && (
            <motion.div
              key="share-icon"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
            >
              <span className="flex items-center gap-2"><FiShare size={18} strokeWidth={2} /><span>{triggerLabel}</span></span>
            </motion.div>
          )}

          {(status === "sending" || status === "success") && (
            <motion.div
              key="sending-container"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 25,
              }}
              className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[17px] bg-neutral-900 text-neutral-50 shadow-sm dark:bg-neutral-100 dark:text-neutral-900"
            >
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden p-2">
                <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90">
                  <circle
                    cx="28"
                    cy="28"
                    r="22"
                    stroke="currentColor"
                    strokeOpacity="0.15"
                    strokeWidth="3"
                    fill="transparent"
                  />

                  <motion.circle
                    cx="28"
                    cy="28"
                    r="22"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="transparent"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: 0 }}
                    transition={{ duration: 1.8, ease: "easeInOut" }}
                  />
                </svg>

                <motion.div
                  key="sending-icon"
                  layoutId="avatar-morph"
                  className="absolute inset-0 m-auto flex size-10 items-center justify-center rounded-full bg-white/15 text-xl"
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.3 }}
                >
                  {selectedUser?.icon}
                </motion.div>

                <AnimatePresence mode="wait">
                  {status === "success" && (
                    <motion.div
                      key="success-check"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 20,
                      }}
                      className="flex h-9 w-9 items-center justify-center"
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>}
      <AnimatePresence mode="popLayout" initial={false}>
        {status === "open" && (
          <motion.div
            className="absolute left-0 top-full z-30 mt-3 w-[220px] origin-top-left rounded-[22px] border border-slate-200 bg-white p-2 shadow-[0_16px_35px_rgba(10,27,51,0.14)]"
            initial={{ opacity: 0, scale: 0.92, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -6 }}
            transition={springTransition}
          >
            <div className="relative flex flex-col">
              {users.map((user) => (
                <motion.div
                  layout
                  key={user.id}
                  onHoverStart={() => setHoveredId(user.id)}
                  onHoverEnd={() => setHoveredId(null)}
                  onClick={() => handleSelectUser(user)}
                  className={cn(
                    "group relative z-10 flex cursor-pointer items-center gap-2 rounded-xl p-1.5",
                    hoveredId === user.id && "px-1"
                  )}
                  animate={{
                    x: hoveredId === user.id ? -2 : 0,
                  }}
                >
                  {hoveredId === user.id && (
                    <motion.div
                      layoutId="hover-bg"
                      className="absolute inset-0 -z-10 rounded-xl bg-slate-100"
                      transition={springTransition}
                    />
                  )}

                  <motion.div
                    layout
                    className="relative h-8 w-8 shrink-0 overflow-hidden"
                    animate={{
                      borderRadius: hoveredId === user.id ? "12px" : "28px",
                    }}
                    transition={springTransition}
                  >
                    <motion.div
                      layout
                      layoutId={selectedUser?.id === user.id ? "avatar-morph" : `icon-${user.id}`}
                      className="flex h-full w-full items-center justify-center bg-slate-100 text-[16px] text-[#0a1b33]"
                    >
                      {user.icon}
                    </motion.div>
                  </motion.div>

                  <motion.span
                    layout
                    className="text-[13px] font-semibold tracking-tight text-[#0a1b33]"
                  >
                    {user.name}
                  </motion.span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

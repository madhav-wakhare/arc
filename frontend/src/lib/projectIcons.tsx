import {
  BookOpen,
  Box,
  Brain,
  Briefcase,
  Camera,
  Cloud,
  Code,
  Cpu,
  Database,
  Dumbbell,
  FlaskConical,
  Folder,
  GitBranch,
  Globe,
  GraduationCap,
  HeartPulse,
  House,
  Layers,
  Lightbulb,
  PenTool,
  Rocket,
  Server,
  Shield,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";

/** Same names and order as PROJECT_ICONS in backend/app/db.py. */
export const PROJECT_ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  "graduation-cap": GraduationCap,
  code: Code,
  server: Server,
  cpu: Cpu,
  brain: Brain,
  rocket: Rocket,
  "flask-conical": FlaskConical,
  database: Database,
  cloud: Cloud,
  shield: Shield,
  wrench: Wrench,
  terminal: Terminal,
  "git-branch": GitBranch,
  layers: Layers,
  lightbulb: Lightbulb,
  "book-open": BookOpen,
  globe: Globe,
  "heart-pulse": HeartPulse,
  home: House,
  dumbbell: Dumbbell,
  camera: Camera,
  "pen-tool": PenTool,
  box: Box,
};

export function ProjectIcon({ icon, size = 15, className }: { icon?: string | null; size?: number; className?: string }) {
  const Icon = (icon && PROJECT_ICONS[icon]) || Folder;
  return <Icon size={size} strokeWidth={1.75} className={clsx("shrink-0 text-fg-2", className)} />;
}

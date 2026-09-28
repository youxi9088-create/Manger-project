"use client";

import { use } from "react";
import ProjectDetailView from "../ProjectDetailView";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: PageProps) {
  const { id } = use(params);
  return <ProjectDetailView projectId={id} />;
}

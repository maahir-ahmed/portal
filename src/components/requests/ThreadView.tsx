"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { timeAgo } from "@/lib/utils";
import { MessageSquare, Lock, Send } from "lucide-react";
import type { CommentWithAuthor } from "@/types";

interface ThreadViewProps {
  comments: CommentWithAuthor[];
  requestType: string;
  requestId: string;
  societySlug: string;
  isExec: boolean;
}

export function ThreadView({
  comments: initialComments,
  requestType,
  requestId,
  societySlug,
  isExec,
}: ThreadViewProps) {
  const [comments, setComments] = useState(initialComments);
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);

    const res = await fetch(`/api/societies/${societySlug}/threads/${requestId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, isInternal, requestType }),
    });

    setSubmitting(false);
    if (res.ok) {
      const newComment = await res.json();
      setComments((prev) => [...prev, newComment]);
      setContent("");
    } else {
      toast.error("Failed to post comment");
    }
  }

  const visibleComments = comments.filter((c) => !c.isInternal || isExec);

  return (
    <Card data-tour="thread">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Discussion ({visibleComments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {visibleComments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet. Start the discussion.</p>
        ) : (
          <div className="space-y-4">
            {visibleComments.map((comment) => (
              <div
                key={comment.id}
                className={`flex gap-3 ${comment.isInternal ? "bg-yellow-50 border border-yellow-200 rounded-lg p-3" : ""}`}
              >
                <UserAvatar name={comment.author.name} avatarUrl={comment.author.avatarUrl} size="sm" className="flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{comment.author.name}</span>
                    {comment.isInternal && (
                      <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                        <Lock className="h-3 w-3" /> Internal
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{timeAgo(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap text-gray-700">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={postComment} className="space-y-3 pt-2 border-t">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add a comment, question, or update…"
            rows={3}
            className="resize-none"
          />
          <div className="flex items-center justify-between">
            {isExec && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Internal note (execs only)
                </span>
              </label>
            )}
            <Button type="submit" size="sm" disabled={submitting || !content.trim()} className="ml-auto">
              <Send className="h-3 w-3 mr-1.5" />
              {submitting ? "Posting…" : "Post"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

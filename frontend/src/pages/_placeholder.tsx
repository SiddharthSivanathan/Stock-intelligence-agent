import { motion } from 'framer-motion';
import { Construction } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  title: string;
  subtitle?: string;
  phase: string;
}

export function PagePlaceholder({ title, subtitle, phase }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl"
    >
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}

      <Card className="glass mt-6">
        <CardContent className="py-12 flex flex-col items-center text-center gap-3">
          <Construction className="h-8 w-8 text-accent" />
          <p className="text-sm text-muted">
            This page lands in <span className="text-text font-medium">{phase}</span>.
            <br />The backend endpoints powering it are already live.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

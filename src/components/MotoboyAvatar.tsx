import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface MotoboyAvatarProps {
  focusedField: 'name' | 'email' | 'password' | null;
  className?: string;
}

export const MotoboyAvatar: React.FC<MotoboyAvatarProps> = ({ focusedField, className = "" }) => {
  const [passwordState, setPasswordState] = useState(false);
  const [lookingDown, setLookingDown] = useState(false);

  useEffect(() => {
    if (focusedField === 'password') {
      setPasswordState(true);
      setLookingDown(false);
    } else if (focusedField === 'name' || focusedField === 'email') {
      setPasswordState(false);
      setLookingDown(true);
    } else {
      setPasswordState(false);
      setLookingDown(false);
    }
  }, [focusedField]);

  return (
    <div className={`relative ${className} w-full h-full flex items-center justify-center`} style={{ perspective: 1000 }}>
      {/* Background neon glow */}
      <div className="absolute inset-0 bg-blue-500/20 blur-[80px] rounded-full scale-125 animate-pulse duration-[4000ms] pointer-events-none mix-blend-screen" />
      
      <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-[120%] h-[120%] max-w-[350px] drop-shadow-[0_20px_40px_rgba(37,99,235,0.4)] relative z-10">
        <defs>
          <linearGradient id="jacketGradient" x1="200" y1="240" x2="200" y2="400" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1e3a8a" />
            <stop offset="1" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="visorGradient" x1="140" y1="140" x2="260" y2="210" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0f172a" />
            <stop offset="1" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="shieldGradient" x1="140" y1="140" x2="260" y2="210" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1e40af" />
            <stop offset="1" stopColor="#3b82f6" />
          </linearGradient>
          <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Motoboy Delivery Bag (Backpack) */}
        <motion.g
          animate={{
            y: lookingDown ? 8 : 0,
            scale: passwordState ? 0.98 : 1
          }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          {/* Main Bag Box */}
          <path d="M50 200 L 90 180 L 130 200 L 130 350 L 50 350 Z" fill="#b91c1c" />
          <path d="M50 200 L 90 180 L 310 180 L 350 200 L 350 350 L 50 350 Z" fill="#dc2626" />
          {/* Bag Lid / Top */}
          <path d="M50 200 L 90 180 L 310 180 L 350 200 Z" fill="#ef4444" />
          {/* Reflective Stripes on Bag */}
          <rect x="70" y="240" width="260" height="20" fill="#fde047" opacity="0.9" filter="url(#neonGlow)" />
          <rect x="70" y="300" width="260" height="20" fill="#fde047" opacity="0.9" filter="url(#neonGlow)" />
        </motion.g>

        {/* Body */}
        <motion.g
          animate={{
            y: lookingDown ? 10 : 0,
            scale: passwordState ? 0.95 : 1
          }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <path d="M100 320 Q 200 240 300 320 L 340 400 L 60 400 Z" fill="url(#jacketGradient)" />
          <path d="M120 320 Q 200 250 280 320 L 310 400 L 90 400 Z" fill="#2563eb" opacity="0.9" />
          
          {/* Glowing collar/zipper accent */}
          <path d="M 190 280 L 210 280 L 205 380 L 195 380 Z" fill="#60a5fa" filter="url(#neonGlow)" />
          <circle cx="200" cy="300" r="15" fill="#3b82f6" filter="url(#neonGlow)" />
        </motion.g>

        {/* Helmet/Head */}
        <motion.g
          animate={{
            rotateX: lookingDown ? 25 : passwordState ? -10 : 0,
            y: lookingDown ? 20 : passwordState ? -5 : 0
          }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          style={{ transformOrigin: "200px 240px" }}
        >
          {/* Base Helmet */}
          <circle cx="200" cy="180" r="90" fill="#1e40af" />
          <circle cx="200" cy="180" r="80" fill="#2563eb" />
          
          {/* Helmet Accent Stripe */}
          <path d="M 160 95 Q 200 80 240 95 L 230 110 Q 200 100 170 110 Z" fill="#60a5fa" filter="url(#neonGlow)" />
          
          {/* Visor Area */}
          <rect x="130" y="130" width="140" height="90" rx="45" fill="url(#visorGradient)" stroke="#3b82f6" strokeWidth="4" />
          
          {/* Eyes inside visor */}
          <motion.g
            animate={{
              opacity: passwordState ? 0 : 1,
              scaleY: lookingDown ? 0.6 : 1,
              y: lookingDown ? 25 : 0,
              x: lookingDown ? 0 : 0
            }}
          >
            <circle cx="165" cy="175" r="14" fill="#60a5fa" filter="url(#neonGlow)" />
            <circle cx="235" cy="175" r="14" fill="#60a5fa" filter="url(#neonGlow)" />
            <circle cx="168" cy="172" r="6" fill="#ffffff" />
            <circle cx="238" cy="172" r="6" fill="#ffffff" />
          </motion.g>

          {/* Visor shield (when password is focused, opaque shield comes down completely blocking eyes) */}
          <motion.g
            animate={{
              y: passwordState ? 0 : -90,
              opacity: passwordState ? 1 : 0
            }}
            transition={{ type: "spring", bounce: 0.4 }}
          >
            <rect x="130" y="130" width="140" height="90" rx="45" fill="url(#shieldGradient)" />
            <path d="M 150 175 Q 200 150 250 175" stroke="#93c5fd" strokeWidth="8" strokeLinecap="round" fill="none" filter="url(#neonGlow)" />
          </motion.g>
        </motion.g>

        {/* Hands / Gloves coming up when password focused to 'hide' eyes */}
        <motion.g
          animate={{
            y: passwordState ? -120 : 0,
            x: passwordState ? 10 : -40,
            rotate: passwordState ? 15 : -30,
            opacity: passwordState ? 1 : 0
          }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          style={{ transformOrigin: "110px 300px" }}
        >
          {/* Left hand covering face */}
          <circle cx="120" cy="280" r="35" fill="#0284c7" />
          <rect x="100" y="240" width="40" height="50" rx="15" fill="#38bdf8" />
        </motion.g>

        <motion.g
          animate={{
            y: passwordState ? -120 : 0,
            x: passwordState ? -10 : 40,
            rotate: passwordState ? -15 : 30,
            opacity: passwordState ? 1 : 0
          }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          style={{ transformOrigin: "290px 300px" }}
        >
          {/* Right hand covering face */}
          <circle cx="280" cy="280" r="35" fill="#0284c7" />
          <rect x="260" y="240" width="40" height="50" rx="15" fill="#38bdf8" />
        </motion.g>

      </svg>
    </div>
  );
};

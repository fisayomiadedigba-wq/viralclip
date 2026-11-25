import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { createUserWithEmailAndPassword, deleteUser, signInWithEmailAndPassword, signOut, User } from 'firebase/auth'
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, where,
  serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore'
import { auth, db, firebaseReady } from './firebase'

type Page = 'feed' | 'me' | 'creator' | 'notifications' | 'upload' | 'settings' | 'admin' | 'info' | 'signin' | 'signup' | 'edit-profile' | 'terms' | 'privacy' | 'about' | 'contact'
type IconName = 'user' | 'bell' | 'plus' | 'heart' | 'comment' | 'share' | 'save' | 'flag' | 'back' | 'settings' | 'trash' | 'play' | 'more' | 'check' | 'chart' | 'shield' | 'users' | 'video' | 'edit'
type Creator = { id: string; name: string; username: string; bio?: string; avatar?: string; followers?: number; following?: number; posts?: number; status?: string }
type Clip = { id: string; ownerId: string; creator: Creator; caption: string; videoUrl?: string; posterUrl?: string; likes: number; comments: number; shares: number; createdAt?: unknown }
type Notice = { id: string; userId?: string; actorId?: string; actorName?: string; text: string; type?: string; createdAt?: { toDate?: () => Date } }
type Report = { id: string; clipId?: string; ownerId?: string; creatorName?: string; reason?: string; status?: string; createdAt?: unknown }

const icons: Record<IconName, ReactNode> = {
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l8 7.8 7.8-7.8a5.5 5.5 0 0 0 1-8.9Z"/>,
  comment: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>,
  share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></>,
  save: <path d="M6 3h12v18l-6-4-6 4Z"/>,
  flag: <path d="M5 22V4m0 0h11l-1 5 4 3H5"/>,
  back: <path d="m15 18-6-6 6-6"/>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A8 8 0 0 0 15 6l-.3-2.6h-4L10.4 6A8 8 0 0 0 9 7L6.5 6 4.5 9.5l2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1A8 8 0 0 0 10.4 18l.3 2.6h4L15 18a8 8 0 0 0 1.5-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z"/></>,
  trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6"/><path d="M10 11v5M14 11v5"/></>,
  play: <path d="m8 5 11 7-11 7Z"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  chart: <path d="M4 20V10m6 10V4m6 16v-7m6 7H2"/>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>,
  users: <><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2M17 11a4 4 0 0 0 0-8M22 21v-2a5 5 0 0 0-3-4.6"/></>,
  video: <><rect x="3" y="5" width="15" height="14" rx="2"/><path d="m18 10 4-2v8l-4-2"/></>,
  edit: <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></>,
}

function Icon({ name, size = 22, fill = false }: { name: IconName; size?: number; fill?: boolean }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>
}

const compact = (n = 0) => n > 999999 ? `${(n / 1e6).toFixed(1)}M` : n > 999 ? `${(n / 1e3).toFixed(1)}K` : String(n)
const placeholderCreator: Creator = { id: 'placeholder', name: 'Your name', username: 'username', bio: 'Your bio will appear here.', followers: 0, following: 0, posts: 0 }

export default function App() {
  const [page, setPage] = useState<Page>(() => window.location.pathname === '/admin' ? 'admin' : 'signin')
  const [user, setUser] = useState<User | null>(null)
  const [clips, setClips] = useState<Clip[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [selected, setSelected] = useState<Creator | null>(null)
  const [currentUserData, setCurrentUserData] = useState<Creator | null>(null)
  const [likes, setLikes] = useState<string[]>([])
  const [saved, setSaved] = useState<string[]>([])
  const [following, setFollowing] = useState<string[]>([])
  const [reportClip, setReportClip] = useState<Clip | null>(null)
  const [commentsClip, setCommentsClip] = useState<Clip | null>(null)
  const [comments, setComments] = useState<{ id: string; text: string; user: string; parentId?: string }[]>([])
  const [comment, setComment] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(firebaseReady)

  useEffect(() => {
    const handleRoute = () => setPage(window.location.pathname === '/admin' ? 'admin' : 'feed')
    window.addEventListener('popstate', handleRoute)
    return () => window.removeEventListener('popstate', handleRoute)
  }, [])

  const openAdmin = () => {
    window.history.pushState({}, '', '/admin')
    setPage('admin')
  }

  const closeAdmin = () => {
    window.history.pushState({}, '', '/')
    setPage('settings')
  }

  useEffect(() => {
    if (!auth) return
    const stop = auth.onAuthStateChanged(currentUser => {
      setUser(currentUser)
      setLoading(false)
      if (currentUser && (page === 'signin' || page === 'signup')) {
        setPage('feed')
      }
    })
    return stop
  }, [page])

  useEffect(() => {
    if (!db) { setLoading(false); return }
    const stopClips = onSnapshot(query(collection(db, 'clips'), orderBy('createdAt', 'desc'), limit(60)), snap => {
      setClips(snap.docs.map(d => ({ id: d.id, ...d.data() } as Clip))); setLoading(false)
    }, () => setLoading(false))
    const stopReports = onSnapshot(query(collection(db, 'reports'), limit(100)), snap => setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as Report))))
    return () => { stopClips(); stopReports() }
  }, [])

  useEffect(() => {
    if (!db || !user) return
    return onSnapshot(collection(db, 'users', user.uid, 'notifications'), snap => setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notice))))
  }, [user])

  useEffect(() => {
    if (!db || !user) return
    const stop = onSnapshot(doc(db, 'users', user.uid), snap => {
      if (snap.exists()) {
        setCurrentUserData({ id: snap.id, ...snap.data() } as Creator)
      }
    })
    return stop
  }, [db, user])

  useEffect(() => {
    if (!db || !user) return
    const stop = onSnapshot(collection(db, 'users', user.uid, 'likedClips'), snap => {
      setLikes(snap.docs.map(d => d.id))
    })
    return stop
  }, [db, user])

  const openCreator = (creator: Creator) => { 
    if (!user) { setPage('signin'); return }
    setSelected(creator); setPage(creator.id === user.uid ? 'me' : 'creator') 
  }
  const toggleFollow = async (creator: Creator) => {
    if (!user || !db || creator.id === 'placeholder') { setToast('Sign in to follow creators.'); return }
    if (creator.id === user.uid) { setToast('You cannot follow yourself.'); return }
    const isFollowing = following.includes(creator.id)
    setFollowing(v => isFollowing ? v.filter(id => id !== creator.id) : [...v, creator.id])
    const followRef = doc(db, 'users', user.uid, 'following', creator.id)
    if (isFollowing) {
      await deleteDoc(followRef)
      await updateDoc(doc(db, 'users', user.uid), { following: increment(-1) })
      await updateDoc(doc(db, 'users', creator.id), { followers: increment(-1) })
    } else {
      await setDoc(followRef, { createdAt: serverTimestamp() })
      await updateDoc(doc(db, 'users', user.uid), { following: increment(1) })
      await updateDoc(doc(db, 'users', creator.id), { followers: increment(1) })
      await addDoc(collection(db, 'users', creator.id, 'notifications'), { type: 'follow', actorId: user.uid, actorName: currentUserData?.name || 'A creator', text: 'started following you', createdAt: serverTimestamp() })
    }
  }
  const toggleLike = async (clip: Clip) => {
    if (!user || !db) { setToast('Sign in to like clips.'); return }
    const isLiked = likes.includes(clip.id)
    setLikes(v => isLiked ? v.filter(id => id !== clip.id) : [...v, clip.id])
    const likeRef = doc(db, 'users', user.uid, 'likedClips', clip.id)
    if (isLiked) {
      await deleteDoc(likeRef)
      await updateDoc(doc(db, 'clips', clip.id), { likes: increment(-1) })
    } else {
      await setDoc(likeRef, { createdAt: serverTimestamp() })
      await updateDoc(doc(db, 'clips', clip.id), { likes: increment(1) })
    }
  }
  const removeClip = async (clip: Clip) => {
    if (db && clip.ownerId === user?.uid) await deleteDoc(doc(db, 'clips', clip.id))
    setClips(v => v.filter(c => c.id !== clip.id)); setToast('Clip deleted.')
  }
  const submitReport = async (reason: string) => {
    if (db && reportClip) await addDoc(collection(db, 'reports'), { clipId: reportClip.id, ownerId: reportClip.ownerId, creatorName: reportClip.creator.name, reason, status: 'open', reporterId: user?.uid, createdAt: serverTimestamp() })
    setReportClip(null); setToast('Report sent to the moderation team.')
  }
  const submitComment = async (e: FormEvent) => {
    e.preventDefault(); if (!comment.trim() || !commentsClip) return
    const row = { id: crypto.randomUUID(), text: comment.trim(), user: 'You', parentId: reply ?? undefined }
    setComments(v => [...v, row]); setComment(''); setReply(null)
    if (db) {
      await addDoc(collection(db, 'clips', commentsClip.id, 'comments'), { ...row, userId: user?.uid, createdAt: serverTimestamp() })
      await updateDoc(doc(db, 'clips', commentsClip.id), { comments: increment(1) })
    }
  }

  useEffect(() => {
    if (!db || !commentsClip) return
    const stop = onSnapshot(collection(db, 'clips', commentsClip.id, 'comments'), orderBy('createdAt', 'asc'), snap => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; text: string; user: string; parentId?: string })))
    })
    return stop
  }, [db, commentsClip])

  const deleteAccount = async () => {
    if (!user || !db || !auth) { setToast('Unable to delete account.'); return }
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone and will delete all your data.')) return

    try {
      // Delete all clips by this user
      const clipsQuery = query(collection(db, 'clips'), where('ownerId', '==', user.uid))
      const clipsSnap = await getDocs(clipsQuery)
      for (const clipDoc of clipsSnap.docs) {
        await deleteDoc(doc(db, 'clips', clipDoc.id))
      }

      // Delete user document
      await deleteDoc(doc(db, 'users', user.uid))

      // Delete Firebase Auth user
      await deleteUser(user)

      setToast('Account deleted successfully.')
      setPage('signin')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to delete account')
    }
  }

  const displayItems = useMemo(() => {
    const items: ({ type: 'clip'; clip: Clip } | { type: 'ad'; id: string; size?: 'native' | '300x250' })[] = []
    clips.forEach((clip, i) => {
      items.push({ type: 'clip', clip })
      if ((i + 1) % 3 === 0) {
        // Alternate between native and 300x250 banners
        const size = (Math.floor((i + 1) / 3) % 2 === 0) ? '300x250' : 'native'
        items.push({ type: 'ad', id: `ad-${i}`, size })
      }
    })
    return items
  }, [clips])

  if (page === 'creator' || page === 'me') {
    if (!user) { setPage('signin'); return null }
    const creator = selected ?? (currentUserData ? { ...placeholderCreator, ...currentUserData, id: user.uid } : { ...placeholderCreator, id: user.uid, username: `creator-${user.uid.slice(0, 5)}` })
    const creatorClips = clips.filter(c => c.ownerId === creator.id)
    return <Shell title={page === 'me' ? 'Profile' : `@${creator.username}`} back={() => setPage('feed')} action={page === 'me' ? <button className="icon-btn dark" aria-label="Settings" onClick={() => setPage('settings')}><Icon name="settings"/></button> : null}>
      <CreatorProfile creator={creator} clips={creatorClips} own={page === 'me'} following={following.includes(creator.id)} onFollow={() => toggleFollow(creator)} onOpen={clip => setPage('feed')} onDelete={removeClip} onEdit={page === 'me' ? () => setPage('edit-profile') : undefined}/>
    </Shell>
  }

  if (page === 'notifications') {
    if (!user) { setPage('signin'); return null }
    return <Shell title="Activity" back={() => setPage('feed')}><Notifications notices={notices} openCreator={async n => {
      if (db && n.actorId) { const all = await getDocs(query(collection(db, 'users'), limit(100))); const found = all.docs.find(d => d.id === n.actorId); if (found) openCreator({ id: found.id, ...found.data() } as Creator) }
    }}/></Shell>
  }
  if (page === 'upload') {
    if (!user) { setPage('signin'); return null }
    return <Shell title="New clip" back={() => setPage('feed')}><Upload user={user} userData={currentUserData} onDone={() => { setToast('Your clip is live.'); setPage('feed') }}/></Shell>
  }
  if (page === 'admin') return <Shell title="Admin studio" back={closeAdmin}><Admin clips={clips} reports={reports} notices={notices} toast={setToast}/></Shell>
  if (page === 'info') return <Shell title="About CLIPS" back={() => setPage('settings')}><About/></Shell>
  if (page === 'terms') return <Shell title="Terms of Service" back={() => setPage('settings')}><Terms/></Shell>
  if (page === 'privacy') return <Shell title="Privacy Policy" back={() => setPage('settings')}><Privacy/></Shell>
  if (page === 'about') return <Shell title="About" back={() => setPage('settings')}><About/></Shell>
  if (page === 'contact') return <Shell title="Contact Us" back={() => setPage('settings')}><Contact/></Shell>
  if (page === 'settings') {
    if (!user) { setPage('signin'); return null }
    return <Shell title="Settings" back={() => setPage('me')}><div className="space-y-6 p-5"><Section title="Account"><Row icon="bell" text="Notifications" onClick={() => setPage('notifications')}/><Row icon="user" text="Edit profile" onClick={() => setPage('edit-profile')}/></Section><Section title="Legal"><Row icon="user" text="Terms of Service" onClick={() => setPage('terms')}/><Row icon="user" text="Privacy Policy" onClick={() => setPage('privacy')}/><Row icon="user" text="About" onClick={() => setPage('about')}/><Row icon="user" text="Contact Us" onClick={() => setPage('contact')}/></Section><Section title="Danger Zone"><Row icon="trash" text="Delete account" onClick={deleteAccount}/><Row icon="back" text="Sign out" onClick={async () => { await signOut(auth!); setPage('signin') }}/></Section></div></Shell>
  }
  if (page === 'edit-profile') {
    if (!user) { setPage('signin'); return null }
    return <Shell title="Edit profile" back={() => setPage('me')}><EditProfile user={user} onDone={() => { setToast('Profile updated.'); setPage('me') }}/></Shell>
  }
  if (page === 'signin') return <Shell title="Sign in" back={() => setPage('signin')}><SignIn onSignIn={() => setPage('feed')} onSignUp={() => setPage('signup')}/></Shell>
  if (page === 'signup') return <Shell title="Sign up" back={() => setPage('signin')}><SignUp onSignUp={() => setPage('feed')}/></Shell>

  return <main className="h-[100dvh] snap-y snap-mandatory overflow-y-auto bg-black text-white">
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 mx-auto flex h-20 max-w-[540px] items-center justify-between px-5">
      <strong className="text-xl font-black tracking-[.18em]">CLIPS<span className="text-lime">.</span></strong>
      <div className="pointer-events-auto flex gap-2"><Circle label="Post" icon="plus" click={() => user ? setPage('upload') : setPage('signin')}/><Circle label="Notifications" icon="bell" click={() => user ? setPage('notifications') : setPage('signin')} badge={notices.length > 0}/><Circle label="Profile" icon="user" click={() => user ? setPage('me') : setPage('signin')}/></div>
    </header>
    {loading && <PlaceholderPanel title="Loading clips…" body="Connecting to your community."/>}
    {!loading && displayItems.length === 0 && <PlaceholderPanel title="Your feed starts here" body="Post the first clip or add clip documents in Firebase to fill this feed." action={() => setPage('upload')}/>}
    {displayItems.map(item => item.type === 'ad'
      ? <AdPlaceholder key={item.id} size={item.size}/>
      : <FeedClip key={item.clip.id} clip={item.clip} liked={likes.includes(item.clip.id)} saved={saved.includes(item.clip.id)} followed={following.includes(item.clip.creator.id)} onCreator={() => openCreator(item.clip.creator)} onFollow={() => toggleFollow(item.clip.creator)} onLike={() => toggleLike(item.clip)} onSave={() => setSaved(v => v.includes(item.clip.id) ? v.filter(x => x !== item.clip.id) : [...v, item.clip.id])} onComments={() => setCommentsClip(item.clip)} onReport={() => setReportClip(item.clip)}/>)}
    {commentsClip && <Sheet title="Comments" close={() => setCommentsClip(null)}><div className="max-h-[52dvh] overflow-auto p-5">{comments.length === 0 && <Empty text="Be the first to comment."/>}{comments.filter(c => !c.parentId).map(c => <div key={c.id} className="mb-5"><p className="text-sm font-bold">{c.user}</p><p className="mt-1 text-sm text-white/75">{c.text}</p><button onClick={() => { setReply(c.id); setComment(`@${c.user} `) }} className="mt-2 min-h-11 text-xs font-bold text-white/45">Reply</button>{comments.filter(r => r.parentId === c.id).map(r => <div key={r.id} className="ml-5 border-l border-white/15 pl-4"><b className="text-xs">{r.user}</b><p className="text-sm text-white/70">{r.text}</p></div>)}</div>)}</div><form onSubmit={submitComment} className="flex gap-2 border-t border-white/10 p-4"><input value={comment} onChange={e => setComment(e.target.value)} className="h-12 min-w-0 flex-1 rounded-full bg-white/10 px-5 outline-none focus:ring-2 focus:ring-lime" placeholder={reply ? 'Write a reply…' : 'Add a comment…'}/><button className="h-12 rounded-full bg-lime px-5 font-bold text-black">Post</button></form></Sheet>}
    {reportClip && <Sheet title="Report clip" close={() => setReportClip(null)}><div className="p-4">{['Spam or misleading','Harassment or bullying','Dangerous activity','Copyright concern'].map(reason => <button key={reason} onClick={() => submitReport(reason)} className="min-h-14 w-full border-b border-white/10 text-left text-sm">{reason}</button>)}</div></Sheet>}
    {toast && <button onClick={() => setToast('')} className="fixed bottom-6 left-1/2 z-[70] min-h-12 -translate-x-1/2 rounded-full bg-lime px-5 text-sm font-bold text-black shadow-xl">{toast}</button>}
  </main>
}

function FeedClip({ clip, liked, saved, followed, onCreator, onFollow, onLike, onSave, onComments, onReport }: { clip: Clip; liked: boolean; saved: boolean; followed: boolean; onCreator: () => void; onFollow: () => void; onLike: () => void; onSave: () => void; onComments: () => void; onReport: () => void }) {
  return <section className="relative mx-auto h-[100dvh] max-w-[540px] snap-start overflow-hidden bg-[#151515]">{clip.videoUrl ? <video src={clip.videoUrl} poster={clip.posterUrl} className="h-full w-full object-cover" loop muted playsInline controls/> : <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_50%_35%,#333,#111_65%)]"><div className="text-center text-white/30"><Icon name="video" size={52}/><p className="mt-3 text-sm font-bold">Video placeholder</p></div></div>}<div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/85"/><div className="absolute bottom-6 left-5 right-24"><div className="mb-3 flex items-center gap-3"><button onClick={onCreator} className="grid h-11 w-11 place-items-center rounded-full bg-lime font-black text-black">{clip.creator.name.slice(0,2).toUpperCase()}</button><button onClick={onCreator} className="min-h-11 text-left"><b className="block">@{clip.creator.username}</b><span className="text-xs text-white/65">{clip.creator.name}</span></button><button onClick={onFollow} className="h-10 rounded-full border border-white/70 px-4 text-sm font-bold">{followed ? 'Following' : 'Follow'}</button></div><p className="text-[15px] leading-6">{clip.caption || 'Add a caption to your clip.'}</p></div><aside className="absolute bottom-6 right-3 flex flex-col items-center gap-2"><Action icon="heart" text={compact(clip.likes + (liked ? 1 : 0))} active={liked} click={onLike}/><Action icon="comment" text={compact(clip.comments)} click={onComments}/><Action icon="share" text="Share" click={() => navigator.share?.({ title: 'CLIPS', url: location.href })}/><Action icon="flag" text="Report" click={onReport}/></aside></section>
}

function CreatorProfile({ creator, clips, own, following, onFollow, onOpen, onDelete, onEdit }: { creator: Creator; clips: Clip[]; own: boolean; following: boolean; onFollow: () => void; onOpen: (c: Clip) => void; onDelete: (c: Clip) => void; onEdit?: () => void }) {
  return <div className="px-5 py-8"><div className="text-center"><div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-lime text-3xl font-black">{creator.name.slice(0,2).toUpperCase()}</div><h2 className="mt-4 text-2xl font-black">{creator.name}</h2><p className="text-sm text-black/50">@{creator.username}</p><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-black/60">{creator.bio || 'No bio yet.'}</p><div className="mx-auto mt-5 flex max-w-sm justify-around">{[[clips.length,'Posts'],[creator.followers ?? 0,'Followers'],[creator.following ?? 0,'Following']].map(([n,l]) => <div key={String(l)} className="p-3"><b className="block text-lg">{n}</b><span className="text-xs text-black/45">{l}</span></div>)}</div>{!own && <button onClick={onFollow} className={`mt-4 h-12 w-full max-w-sm rounded-full font-bold ${following ? 'border border-black/20' : 'bg-black text-white'}`}>{following ? 'Unfollow' : 'Follow'}</button>}{own && onEdit && <button onClick={onEdit} className="mt-4 h-12 w-full max-w-sm rounded-full border border-black/20 font-bold">Edit profile</button>}</div><h3 className="mt-10 border-b border-black/10 pb-3 font-black">{own ? 'Your clips' : 'All clips'}</h3>{clips.length === 0 ? <div className="py-16"><Empty text="No clips posted yet."/></div> : <div className="mt-2 grid grid-cols-3 gap-1">{clips.map(clip => <div key={clip.id} className="group relative aspect-[3/4] overflow-hidden bg-neutral-200"><button onClick={() => onOpen(clip)} className="h-full w-full">{clip.posterUrl ? <img src={clip.posterUrl} alt="" className="h-full w-full object-cover"/> : <span className="grid h-full place-items-center text-black/20"><Icon name="play"/></span>}</button>{own && <button onClick={() => onDelete(clip)} className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full bg-black/70 text-white" aria-label="Delete this clip"><Icon name="trash" size={18}/></button>}</div>)}</div>}</div>
}

function Notifications({ notices, openCreator }: { notices: Notice[]; openCreator: (n: Notice) => void }) {
  return <div className="p-5">{notices.length === 0 && <div className="py-20"><Empty text="Notifications will appear here."/></div>}{notices.map(n => <button key={n.id} onClick={() => openCreator(n)} className="flex min-h-20 w-full items-center gap-3 border-b border-black/10 text-left"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lime font-black">{(n.actorName || 'A').slice(0,2).toUpperCase()}</span><span className="flex-1 text-sm"><b>{n.type === 'admin' ? 'CLIPS Admin' : n.actorName || 'A creator'}</b> {n.text}</span><Icon name="back" size={16}/></button>)}</div>
}

function Upload({ user, onDone, userData }: { user: User; onDone: () => void; userData: Creator | null }) {
  const [file, setFile] = useState<File | null>(null), [caption, setCaption] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState(0)
  const choose = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (!f) return; const url = URL.createObjectURL(f), v = document.createElement('video'); v.onloadedmetadata = () => { URL.revokeObjectURL(url); if (v.duration < 5 || v.duration > 60) setError('Choose a video between 5 and 60 seconds.'); else { setFile(f); setError('') } }; v.src = url }
  const post = async () => {
    if (!file || !db) { setError('Add your Firebase environment values and enable Firestore first.'); return }
    const cloudName = import.meta.env.VITE_PUBLIC_CLOUDINARY_CLOUD_NAME
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
    if (!cloudName || !uploadPreset) { setError('Add Cloudinary cloud name and upload preset to .env'); return }

    setProgress(10)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', uploadPreset)
    formData.append('resource_type', 'video')

    try {
      setProgress(30)
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
        method: 'POST',
        body: formData,
      })
      setProgress(70)
      if (!response.ok) throw new Error('Upload failed')
      const data = await response.json()
      setProgress(90)
      await addDoc(collection(db, 'clips'), {
        ownerId: user.uid,
        creator: {
          id: user.uid,
          name: userData?.name || 'Creator',
          username: userData?.username || `creator-${user.uid.slice(0,5)}`
        },
        caption,
        videoUrl: data.secure_url,
        posterUrl: data.secure_url.replace('.mp4', '.jpg'),
        likes: 0,
        comments: 0,
        shares: 0,
        createdAt: serverTimestamp()
      })
      await updateDoc(doc(db, 'users', user.uid), { posts: increment(1) })
      setProgress(100)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      setProgress(0)
    }
  }
  return <div className="p-5"><label className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-black/20 bg-white text-center"><input type="file" accept="video/*" onChange={choose} className="sr-only"/><span className="grid h-16 w-16 place-items-center rounded-full bg-lime"><Icon name="plus" size={30}/></span><b className="mt-4">{file?.name || 'Choose a video'}</b><span className="mt-2 text-sm text-black/50">5–60 seconds · vertical works best</span></label><textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Write a caption…" className="mt-5 min-h-28 w-full rounded-2xl bg-white p-4 outline-none focus:ring-2 focus:ring-black"/>{error && <p role="alert" className="mt-3 rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}{progress > 0 && <p className="mt-3 text-sm font-bold">Uploading {progress}%</p>}<button onClick={post} disabled={!file} className="mt-5 h-12 w-full rounded-full bg-black font-bold text-white disabled:opacity-30">Post clip</button></div>
}

function Admin({ clips, reports, notices, toast }: { clips: Clip[]; reports: Report[]; notices: Notice[]; toast: (s: string) => void }) {
  const [tab, setTab] = useState<'overview'|'reports'|'users'>('overview')
  const users = new Map(clips.map(c => [c.ownerId, c.creator]))
  const moderate = async (r: Report, action: 'warn'|'ban'|'delete'|'dismiss') => {
    if (!db) { toast('Connect Firebase to perform moderation actions.'); return }
    if (action === 'warn' && r.ownerId) await addDoc(collection(db, 'users', r.ownerId, 'notifications'), { type: 'admin', actorName: 'CLIPS Admin', text: 'sent you a warning about content that may break our community rules.', createdAt: serverTimestamp() })
    if (action === 'ban' && r.ownerId) { await setDoc(doc(db, 'users', r.ownerId), { status: 'banned', bannedAt: serverTimestamp() }, { merge: true }); await addDoc(collection(db, 'users', r.ownerId, 'notifications'), { type: 'admin', actorName: 'CLIPS Admin', text: 'restricted your account after a moderation review.', createdAt: serverTimestamp() }) }
    if (action === 'delete' && r.clipId) await deleteDoc(doc(db, 'clips', r.clipId))
    await updateDoc(doc(db, 'reports', r.id), { status: action === 'dismiss' ? 'dismissed' : 'actioned', action, reviewedAt: serverTimestamp() }); toast(`Report ${action === 'dismiss' ? 'dismissed' : 'actioned'}.`)
  }
  return <div className="p-5"><div className="rounded-3xl bg-[#171717] p-6 text-white"><span className="text-xs font-bold uppercase tracking-widest text-lime">Live overview</span><h2 className="mt-2 text-3xl font-black">Community health</h2><div className="mt-6 grid grid-cols-3 gap-2">{[[users.size,'Users'],[clips.length,'Clips'],[reports.filter(r => r.status !== 'dismissed' && r.status !== 'actioned').length,'Open reports']].map(([n,l]) => <div key={String(l)} className="rounded-2xl bg-white/10 p-3"><b className="text-xl">{n}</b><span className="mt-1 block text-xs text-white/50">{l}</span></div>)}</div></div><div role="tablist" className="mt-6 flex gap-2 rounded-full bg-black/5 p-1">{(['overview','reports','users'] as const).map(t => <button role="tab" aria-selected={tab === t} key={t} onClick={() => setTab(t)} className={`h-11 flex-1 rounded-full text-sm font-bold capitalize ${tab === t ? 'bg-black text-white' : ''}`}>{t}</button>)}</div>{tab === 'overview' && <div className="mt-5 grid gap-3 sm:grid-cols-2"><Stat icon="chart" title="Engagement" value={compact(clips.reduce((n,c) => n + c.likes + c.comments + c.shares, 0))}/><Stat icon="bell" title="Notifications" value={compact(notices.length)}/><Stat icon="shield" title="Resolution rate" value={`${reports.length ? Math.round(reports.filter(r => r.status === 'actioned' || r.status === 'dismissed').length / reports.length * 100) : 0}%`}/><Stat icon="video" title="Published clips" value={String(clips.length)}/></div>}{tab === 'reports' && <div className="mt-5 space-y-3">{reports.length === 0 && <Empty text="No reports to review."/>}{reports.map(r => <div key={r.id} className="rounded-2xl bg-white p-4"><div className="flex justify-between gap-3"><div><b>{r.reason || 'Content report'}</b><p className="mt-1 text-xs text-black/45">{r.creatorName || 'Unknown creator'} · {r.status || 'open'}</p></div><Icon name="flag"/></div><div className="mt-4 grid grid-cols-4 gap-1">{(['warn','ban','delete','dismiss'] as const).map(a => <button key={a} onClick={() => moderate(r,a)} className={`min-h-11 rounded-xl text-xs font-bold capitalize ${a === 'delete' || a === 'ban' ? 'bg-red-50 text-red-700' : 'bg-black/5'}`}>{a}</button>)}</div></div>)}</div>}{tab === 'users' && <div className="mt-5">{[...users.values()].map(u => <div key={u.id} className="flex min-h-16 items-center gap-3 border-b border-black/10"><span className="grid h-10 w-10 place-items-center rounded-full bg-lime text-sm font-black">{u.name.slice(0,2).toUpperCase()}</span><div className="flex-1"><b className="text-sm">{u.name}</b><p className="text-xs text-black/45">@{u.username}</p></div><span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">{u.status || 'active'}</span></div>)}</div>}</div>
}

function Shell({ title, back, action, children }: { title: string; back: () => void; action?: ReactNode; children: ReactNode }) { return <main className="min-h-[100dvh] bg-[#f3f2ee] text-[#111]"><header className="sticky top-0 z-30 mx-auto flex h-16 max-w-[640px] items-center justify-between border-b border-black/10 bg-[#f3f2ee]/95 px-4 backdrop-blur"><button className="icon-btn dark" onClick={back} aria-label="Go back"><Icon name="back"/></button><h1 className="font-black">{title}</h1><div className="grid h-11 w-11 place-items-center">{action}</div></header><div className="mx-auto max-w-[640px]">{children}</div></main> }
function Sheet({ title, close, children }: { title: string; close: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end bg-black/60" onMouseDown={e => e.target === e.currentTarget && close()}><div role="dialog" aria-modal="true" aria-label={title} className="mx-auto max-h-[85dvh] w-full max-w-[540px] overflow-hidden rounded-t-[28px] bg-[#151515] text-white"><header className="flex h-16 items-center justify-between border-b border-white/10 px-5"><h2 className="font-black">{title}</h2><button onClick={close} className="h-11 px-3 font-bold">Close</button></header>{children}</div></div> }
function Circle({ label, icon, click, badge }: { label: string; icon: IconName; click: () => void; badge?: boolean }) { return <button onClick={click} aria-label={label} className="relative grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/35 backdrop-blur">{<Icon name={icon}/>} {badge && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-lime ring-2 ring-black"/>}</button> }
function Action({ icon, text, click, active }: { icon: IconName; text: string; click: () => void; active?: boolean }) { return <button onClick={click} aria-pressed={active} className={`flex min-h-14 min-w-14 flex-col items-center gap-1 text-xs font-bold ${active ? 'text-lime' : ''}`}><span className="grid h-10 w-10 place-items-center rounded-full bg-black/40"><Icon name={icon} fill={active}/></span>{text}</button> }
function PlaceholderPanel({ title, body, action }: { title: string; body: string; action?: () => void }) { return <section className="mx-auto grid h-[100dvh] max-w-[540px] snap-start place-items-center bg-[radial-gradient(circle_at_50%_40%,#292929,#090909_70%)] px-8 text-center"><div><span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/5 text-white/30"><Icon name="video" size={36}/></span><h2 className="mt-6 text-2xl font-black">{title}</h2><p className="mt-3 text-sm leading-6 text-white/50">{body}</p>{action && <button onClick={action} className="mt-6 h-12 rounded-full bg-lime px-6 font-bold text-black">Post a clip</button>}</div></section> }
function AdPlaceholder({ size }: { size?: 'native' | '300x250' }) {
  if (size === '300x250') {
    return <section className="mx-auto grid h-[100dvh] max-w-[540px] snap-start place-items-center bg-[#f0eee7] p-6 text-center text-black"><div className="mx-auto w-[300px] h-[250px] rounded-2xl border border-black/10 bg-white p-6 shadow-sm flex flex-col items-center justify-center"><span className="rounded-full border border-black/15 px-3 py-1 text-xs font-bold uppercase tracking-widest">Sponsored</span><div className="mt-4 w-full aspect-[4/3] rounded-xl bg-[linear-gradient(135deg,#d7ff64,#c9b7ff)]"/><h2 className="mt-4 text-lg font-black">300x250 Banner</h2><p className="mt-1 text-xs leading-5 text-black/55">Standard IAB banner placeholder</p></div></section>
  }
  return <section className="mx-auto grid h-[100dvh] max-w-[540px] snap-start place-items-center bg-[#f0eee7] p-6 text-center text-black"><div className="w-full max-w-sm rounded-[32px] border border-black/10 bg-white p-8 shadow-sm"><span className="rounded-full border border-black/15 px-3 py-1 text-xs font-bold uppercase tracking-widest">Sponsored</span><div className="mx-auto mt-8 aspect-[4/3] w-full rounded-2xl bg-[linear-gradient(135deg,#d7ff64,#c9b7ff)]"/><h2 className="mt-6 text-2xl font-black">Native banner placeholder</h2><p className="mt-2 text-sm leading-6 text-black/55">Your ad network’s native creative appears here after every three clips.</p><button className="mt-6 h-12 w-full rounded-full bg-black font-bold text-white">Learn more</button></div></section> }
function Empty({ text }: { text: string }) { return <p className="text-center text-sm text-black/45">{text}</p> }
function Section({ title, children }: { title: string; children: ReactNode }) { return <section><h2 className="mb-2 px-2 text-xs font-bold uppercase tracking-widest text-black/40">{title}</h2><div className="overflow-hidden rounded-2xl bg-white px-4">{children}</div></section> }
function Row({ icon, text, onClick }: { icon: IconName; text: string; onClick: () => void }) { return <button onClick={onClick} className="flex min-h-16 w-full items-center gap-3 border-b border-black/10 font-bold last:border-0"><Icon name={icon}/><span className="flex-1 text-left">{text}</span><Icon name="back" size={16}/></button> }
function Stat({ icon, title, value }: { icon: IconName; title: string; value: string }) { return <div className="rounded-2xl bg-white p-5"><Icon name={icon}/><b className="mt-5 block text-3xl">{value}</b><span className="text-sm text-black/45">{title}</span></div> }

function SignIn({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!auth) { setError('Firebase not initialized'); return }
    try {
      await signInWithEmailAndPassword(auth, email, password)
      onSignIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    }
  }
  
  return <div className="p-5"><form onSubmit={handleSubmit} className="space-y-4"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-2xl bg-white p-4 outline-none focus:ring-2 focus:ring-black" required/><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full rounded-2xl bg-white p-4 outline-none focus:ring-2 focus:ring-black" required/>{error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}<button type="submit" className="h-12 w-full rounded-full bg-black font-bold text-white">Sign in</button></form><button onClick={onSignUp} className="mt-4 w-full text-sm text-black/60">Don't have an account? Sign up</button></div>
}

function SignUp({ onSignUp }: { onSignUp: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!auth) { setError('Firebase not initialized'); return }
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password)
      if (db && result.user) {
        await setDoc(doc(db, 'users', result.user.uid), {
          name: name || 'New User',
          username: `user-${result.user.uid.slice(0, 5)}`,
          bio: '',
          followers: 0,
          following: 0,
          posts: 0,
          createdAt: serverTimestamp()
        })
      }
      onSignUp()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    }
  }
  
  return <div className="p-5"><form onSubmit={handleSubmit} className="space-y-4"><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="w-full rounded-2xl bg-white p-4 outline-none focus:ring-2 focus:ring-black" required/><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-2xl bg-white p-4 outline-none focus:ring-2 focus:ring-black" required/><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 6 characters)" className="w-full rounded-2xl bg-white p-4 outline-none focus:ring-2 focus:ring-black" minLength={6} required/>{error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}<button type="submit" className="h-12 w-full rounded-full bg-black font-bold text-white">Sign up</button></form></div>
}

function EditProfile({ user, onDone }: { user: User | null; onDone: () => void }) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!db || !user) return
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) {
        const data = snap.data()
        setName(data.name || '')
        setUsername(data.username || '')
        setBio(data.bio || '')
      }
    })
  }, [db, user])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!db || !user) { setError('Firebase not initialized'); return }
    try {
      await setDoc(doc(db, 'users', user.uid), { name, username, bio }, { merge: true })
      // Update all clips by this user with new name/username
      const clipsQuery = query(collection(db, 'clips'), where('ownerId', '==', user.uid))
      const clipsSnap = await getDocs(clipsQuery)
      clipsSnap.forEach(async (clipDoc) => {
        await updateDoc(doc(db, 'clips', clipDoc.id), {
          'creator.name': name,
          'creator.username': username
        })
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  return <div className="p-5"><form onSubmit={handleSubmit} className="space-y-4"><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Display name" className="w-full rounded-2xl bg-white p-4 outline-none focus:ring-2 focus:ring-black"/><input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" className="w-full rounded-2xl bg-white p-4 outline-none focus:ring-2 focus:ring-black"/><textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Bio" className="w-full rounded-2xl bg-white p-4 outline-none focus:ring-2 focus:ring-black" rows={3}/>{error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}<button type="submit" className="h-12 w-full rounded-full bg-black font-bold text-white">Save changes</button></form></div>
}

function Terms() {
  return <div className="p-6"><h1 className="mt-8 text-3xl font-black">Terms of Service</h1><div className="mt-6 space-y-6 text-sm leading-7 text-black/60"><section><h2 className="mb-2 text-lg font-bold text-black">1. Acceptance of Terms</h2><p>By accessing and using CLIPS, you accept and agree to be bound by the terms and provisions of this agreement.</p></section><section><h2 className="mb-2 text-lg font-bold text-black">2. User Accounts</h2><p>You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account.</p></section><section><h2 className="mb-2 text-lg font-bold text-black">3. Content</h2><p>You retain ownership of content you post on CLIPS. By posting content, you grant us a license to use, display, and distribute your content.</p></section><section><h2 className="mb-2 text-lg font-bold text-black">4. Prohibited Conduct</h2><p>You may not post content that is illegal, harmful, threatening, abusive, or otherwise objectionable.</p></section><section><h2 className="mb-2 text-lg font-bold text-black">5. Termination</h2><p>We reserve the right to terminate or suspend your account at our sole discretion.</p></section></div></div>
}

function Privacy() {
  return <div className="p-6"><h1 className="mt-8 text-3xl font-black">Privacy Policy</h1><div className="mt-6 space-y-6 text-sm leading-7 text-black/60"><section><h2 className="mb-2 text-lg font-bold text-black">1. Information We Collect</h2><p>We collect information you provide directly, such as your name, email, and profile information.</p></section><section><h2 className="mb-2 text-lg font-bold text-black">2. How We Use Your Information</h2><p>We use your information to provide, maintain, and improve our services, and to communicate with you.</p></section><section><h2 className="mb-2 text-lg font-bold text-black">3. Information Sharing</h2><p>We do not sell your personal information. We may share information with service providers who perform services on our behalf.</p></section><section><h2 className="mb-2 text-lg font-bold text-black">4. Data Security</h2><p>We implement reasonable security measures to protect your information from unauthorized access.</p></section><section><h2 className="mb-2 text-lg font-bold text-black">5. Your Rights</h2><p>You have the right to access, update, or delete your personal information at any time.</p></section></div></div>
}

function About() {
  return <div className="p-6"><h1 className="mt-8 text-4xl font-black">Small moments.<br/>Big energy.</h1><p className="mt-6 text-lg leading-7 text-black/60">CLIPS is a short-form video community where creators share their moments with the world. Our platform is built on Firebase, powering account data, uploads, notifications, reports, and moderation.</p><div className="mt-8 space-y-4"><section><h2 className="mb-2 text-lg font-bold text-black">Our Mission</h2><p className="text-sm text-black/60">To empower creators to share their authentic selves and connect with communities that matter.</p></section><section><h2 className="mb-2 text-lg font-bold text-black">Technology</h2><p className="text-sm text-black/60">Built with React, Firebase, and modern web technologies to deliver a seamless experience.</p></section></div></div>
}

function Contact() {
  const [sent, setSent] = useState(false)
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setSent(true)
  }
  return <div className="p-6"><h1 className="mt-8 text-3xl font-black">Contact Us</h1><p className="mt-4 text-sm text-black/60">Have questions or feedback? We'd love to hear from you.</p>{!sent ? <form onSubmit={handleSubmit} className="mt-6 space-y-4"><input type="email" placeholder="Your email" className="w-full rounded-2xl bg-white p-4 outline-none focus:ring-2 focus:ring-black" required/><textarea placeholder="Your message" className="w-full rounded-2xl bg-white p-4 outline-none focus:ring-2 focus:ring-black" rows={5} required/><button type="submit" className="h-12 w-full rounded-full bg-black font-bold text-white">Send message</button></form> : <div className="mt-6 rounded-2xl bg-lime/20 p-6 text-center"><p className="font-bold text-black">Message sent!</p><p className="mt-2 text-sm text-black/60">We'll get back to you soon.</p></div>}</div>
}

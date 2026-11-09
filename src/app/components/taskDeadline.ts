export function formatTaskDeadline(value: string | null | undefined): string {
    if (!value) return 'Chưa đặt'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Không hợp lệ'
    return new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date)
}

export function isTaskOverdue(value: string | null | undefined, status: string): boolean {
    if (!value || !['PENDING', 'ASSIGNED', 'REJECTED', 'ERROR_REPORTED'].includes(status)) return false
    const deadline = new Date(value).getTime()
    return Number.isFinite(deadline) && deadline < Date.now()
}

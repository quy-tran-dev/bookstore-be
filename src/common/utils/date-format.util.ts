export class DateFormatUtil {
  static formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds}`;
  }

  static formatDateDay = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  };

  static formatAMPM = (dt: number): string => {
    const date: Date = new Date(dt * 1000);
    let hours: number | string = date.getHours();
    let minutes: number | string = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours %= 12;
    hours = hours || 12;
    hours = hours < 10 ? `0${hours}` : hours;
    minutes = minutes < 10 ? `0${minutes}` : minutes;
    const strTime = `${hours}:${minutes} ${ampm}`;
    return strTime;
  };

  static formatDMY = (dt: number): string => {
    const date: Date = new Date(dt * 1000);
    const dayWeek = date.toLocaleString('en-us', { weekday: 'long' });
    let day: number | string = date.getDate();
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    day = day < 10 ? `0${day}` : day;
    const strTime = `${dayWeek}, ${day} ${month}, ${year}`;
    return strTime;
  };
}
